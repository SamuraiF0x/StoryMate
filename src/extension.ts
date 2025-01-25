import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as Handlebars from "handlebars";
import defaultTemplateSource from "./templates/defaultStoryTemplate.hbs";

interface StoryMateConfig {
	watchDirectories: string[];
	templatePath: string;
	fileExtensions: string[];
}

interface Variant {
	type: string;
	values: any;
}

export function activate(context: vscode.ExtensionContext) {
	// File creation watcher
	const fileCreateDisposable = vscode.workspace.onDidCreateFiles(async (event) => {
		const config = getStoryMateConfig();

		for (const file of event.files) {
			if (shouldProcessFile(file, config)) {
				try {
					await createCompanionFile(file, config);
				} catch (error) {
					vscode.window.showErrorMessage(`StoryMate: Failed to create companion file - ${error}`);
				}
			}
		}
	});

	// File modification watcher
	const fileModifyDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const config = getStoryMateConfig();

		if (shouldProcessFile(document.uri, config)) {
			try {
				const companionFiles = await findCompanionFiles(document.uri);
				for (const companionFile of companionFiles) {
					await updateCompanionFile(document.uri, companionFile, config);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`StoryMate: Failed to update companion files - ${error}`);
			}
		}
	});

	context.subscriptions.push(fileCreateDisposable, fileModifyDisposable);
}

// Retrieve StoryMate configuration from workspace settings or use defaults
function getStoryMateConfig(): StoryMateConfig {
	const configs = vscode.workspace.getConfiguration("storyMate");
	return {
		watchDirectories: configs.get("watchDirectories") || ["ui/src/components"],
		templatePath: configs.get("templatePath") || "apps/storybook/.storybook/storymate.template.hbs",
		fileExtensions: configs.get("fileExtensions") || [".tsx", ".jsx"],
	};
}

// Determine if a file should be processed based on configuration
function shouldProcessFile(file: vscode.Uri, config: StoryMateConfig): boolean {
	// Check if file is in watched directories and has correct extension
	return config.watchDirectories.some(
		(watchPath) =>
			file.path.includes(watchPath) &&
			config.fileExtensions.some((ext) => file.path.endsWith(ext)) &&
			!file.path.includes(".stories.")
	);
}

// Read and return the Handlebars template content
async function readHandlebarsTemplate(config: StoryMateConfig): Promise<string> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const workspacePath = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : "";

	const templatePaths = [path.join(workspacePath, config.templatePath)];

	for (const templatePath of templatePaths) {
		try {
			return await fs.promises.readFile(templatePath, "utf8");
		} catch {}
	}

	// Return imported default template if custom template is not found
	return defaultTemplateSource;
}

// Create a companion file for the given original file
async function createCompanionFile(originalFile: vscode.Uri, config: StoryMateConfig) {
	const fileName = path.basename(originalFile.fsPath);
	const fileDir = path.dirname(originalFile.fsPath);
	const componentName = path.basename(fileName, path.extname(fileName));

	const storiesFileName = `${componentName}.stories.tsx`;
	const storiesFilePath = path.join(fileDir, storiesFileName);

	// Read component file to extract variants
	const componentContent = await vscode.workspace.fs.readFile(originalFile);
	const {
		variants: variantsInfo,
		propsInterfaceName,
		isInteractionsComponent,
	} = extractVariantsFromFile(componentContent.toString());

	// Read and compile Handlebars template
	const templateContent = await readHandlebarsTemplate(config);
	const template = Handlebars.compile(templateContent);

	// Generate stories file content
	const storiesContent = template({
		componentName,
		variants: variantsInfo,
		dirName: path.basename(path.dirname(fileDir)),
		propsInterfaceName,
		isInteractionsComponent,
	});

	await vscode.workspace.fs.writeFile(vscode.Uri.file(storiesFilePath), Buffer.from(storiesContent));
}

// Extract variants and other relevant information from the component file content
function extractVariantsFromFile(fileContent: string) {
	const variants: { [key: string]: Variant | any } = {};

	// Detect exported props interface
	const propsInterfaceRegex = /export interface (\w+Props)\s*{([^}]+)}/;
	const propsInterfaceMatch = fileContent.match(propsInterfaceRegex);
	const propsInterfaceName = propsInterfaceMatch ? propsInterfaceMatch[1] : null;

	// Use regex to find variant and defaultVariants definitions
	const variantRegex = /(\w+)\s*:\s*{\s*(\w+)\s*:\s*{[^}]*}[^}]*}/g;
	const defaultVariantsRegex = /defaultVariants:\s*{([^}]+)}/;

	// Extract variants
	let match;
	while ((match = variantRegex.exec(fileContent)) !== null) {
		const variantName = match[1];
		const variantType = match[2];
		variants[variantName] = {
			type: variantType,
			values: extractVariantValues(fileContent, variantName),
		};
	}

	// Extract default variants
	const defaultMatch = defaultVariantsRegex.exec(fileContent);
	if (defaultMatch) {
		variants["defaultVariants"] = parseDefaultVariants(defaultMatch[1]);
	}

	// Detect if component is in interactions folder
	const isInteractionsComponent = /interactions/i.test(fileContent);

	return {
		variants,
		propsInterfaceName,
		isInteractionsComponent,
	};
}

// Extract variant values from the component file content
function extractVariantValues(fileContent: string, variantName: string): string[] {
	const valuesRegex = new RegExp(`export const ${variantName.toUpperCase()}:\\s*\\[([^\\]]+)\\]`);
	const match = fileContent.match(valuesRegex);

	if (match) {
		return match[1].split(",").map((val) => val.trim().replace(/['"`]/g, ""));
	}
	return [];
}

// Parse default variants from the string representation
function parseDefaultVariants(defaultVariantsStr: string): Record<string, string> {
	const defaults: Record<string, string> = {};
	const keyValueRegex = /(\w+):\s*['"`]?(\w+)['"`]?/g;

	let match;
	while ((match = keyValueRegex.exec(defaultVariantsStr)) !== null) {
		defaults[match[1]] = match[2];
	}

	return defaults;
}

// Update the companion file based on the component file content
async function updateCompanionFile(componentFile: vscode.Uri, companionFile: vscode.Uri, config: StoryMateConfig) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const workspacePath = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : "";

	const templatePath = path.join(workspacePath, config.templatePath);
	const templateContent = await fs.promises.readFile(templatePath, "utf8");
	const template = Handlebars.compile(templateContent);

	const componentName = path.basename(componentFile.fsPath, path.extname(componentFile.fsPath));
	const dirName = path.basename(path.dirname(componentFile.fsPath));

	const componentContent = await vscode.workspace.fs.readFile(componentFile);
	const variantsInfo = extractVariantsFromFile(componentContent.toString());

	const updatedStoriesContent = template({
		componentName,
		variants: variantsInfo,
		dirName,
	});

	await vscode.workspace.fs.writeFile(companionFile, Buffer.from(updatedStoriesContent));
}

// Find companion files for the given component file
async function findCompanionFiles(componentFile: vscode.Uri): Promise<vscode.Uri[]> {
	const componentDir = path.dirname(componentFile.fsPath);
	const componentName = path.basename(componentFile.fsPath, path.extname(componentFile.fsPath));

	const companionPattern = new vscode.RelativePattern(componentDir, `${componentName}.stories.tsx`);

	return await vscode.workspace.findFiles(companionPattern);
}

export function deactivate() {}
