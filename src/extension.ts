import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import * as Handlebars from "handlebars";
// import defaultTemplateSource from "./templates/defaultStoryTemplate.hbs";
// const defaultTemplateSource = require("./templates/defaultStoryTemplate.hbs") as string;

interface StoryMateConfig {
	watchDirectories: string[];
	templatePath: string;
	fileExtensions: string[];
}

interface Variant {
	key: string;
	value: string;
}
interface DefaultVariant {
	key: string;
	value: string;
}

interface VariantsData {
	variants: Variant[];
	defaultVariants: DefaultVariant[];
}

const defaultTemplateSource = `import type { Meta, StoryObj } from '@storybook/react';

{{#if propsInterfaceName}}
import type { {{propsInterfaceName}} } from './{{componentName}}';
{{/if}}
import {{componentName}}{{#if variants.length}}, { {{#each variants}}{{this.value}}{{#unless @last}}, {{/unless}}{{/each}} }{{/if}} from './{{componentName}}';

const meta: {{#if propsInterfaceName}}Meta<{{propsInterfaceName}}>{{else}}Meta<typeof {{componentName}}>{{/if}} = {
  title: '{{dirName}}/{{componentName}}',
  component: {{componentName}},
  argTypes: {
    {{#each variants}}
    {{this.key}}: {
      options: {{this.value}},
      control: 'select',
    },
    {{/each}}
    {{#if isInteractionsComponent}}
    onPress: { action: 'Pressed' },
    {{/if}}
  },
  args: {
    children: 'Default Text',
    {{#each defaultVariants}}
    {{this.key}}: '{{this.value}}',
    {{/each}}
  },
} satisfies {{#if propsInterfaceName}}Meta<{{propsInterfaceName}}>{{else}}Meta<typeof {{componentName}}>{{/if}};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  parameters: {
    design: {
      type: 'figma',
      url: '{{#if figmaUrl}}{{figmaUrl}}{{else}}REPLACE_WITH_FIGMA_URL{{/if}}',
      allowFullscreen: true,
    },
  },
};
`;

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

	// // File modification watcher
	// const fileModifyDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
	// 	const config = getStoryMateConfig();

	// 	if (shouldProcessFile(document.uri, config)) {
	// 		try {
	// 			const companionFiles = await findCompanionFiles(document.uri);
	// 			for (const companionFile of companionFiles) {
	// 				await updateCompanionFile(document.uri, companionFile, config);
	// 			}
	// 		} catch (error) {
	// 			vscode.window.showErrorMessage(`StoryMate: Failed to update companion files - ${error}`);
	// 		}
	// 	}
	// });

	// context.subscriptions.push(fileCreateDisposable, fileModifyDisposable);
	context.subscriptions.push(fileCreateDisposable);
}

// Retrieve StoryMate configuration from workspace settings or use defaults
function getStoryMateConfig(): StoryMateConfig {
	const configs = vscode.workspace.getConfiguration("storyMate");
	return {
		watchDirectories: configs.get("watchDirectories") || ["ui/src/components/**/*"],
		templatePath: configs.get("templatePath") || "",
		fileExtensions: configs.get("fileExtensions") || [".tsx"],
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

// Create a companion file for the given original file
async function createCompanionFile(originalFile: vscode.Uri, config: StoryMateConfig) {
	const fileName = path.basename(originalFile.fsPath);
	const fileDir = path.dirname(originalFile.fsPath);

	const componentName = path.basename(fileName, path.extname(fileName));

	const storiesFileName = `${componentName}.stories.tsx`;
	const storiesFilePath = path.join(fileDir, storiesFileName);

	// Read component file to extract variants
	const componentContent = await vscode.workspace.fs.readFile(originalFile);
	const { variantsData, propsInterfaceName, isInteractionsComponent } = extractVariantsFromFile(
		componentContent.toString(),
		fileDir
	);

	// Read and compile Handlebars template
	const templateContent = await readHandlebarsTemplate(config);
	const template = Handlebars.compile(templateContent);

	const dirName = (() => {
		const pathParts = fileDir.split(path.sep);
		const componentsIndex = pathParts.lastIndexOf("components");
		return componentsIndex !== -1 && pathParts[componentsIndex + 1]
			? pathParts[componentsIndex + 1]
			: pathParts[pathParts.length - 1];
	})();

	// Format the directory name to have a capitalized first letter (e.g., "Interactions")
	const formattedDirName = dirName.charAt(0).toUpperCase() + dirName.slice(1);

	// Generate stories file content
	const storiesContent = template({
		componentName,
		variants: variantsData.variants,
		defaultVariants: variantsData.defaultVariants,
		dirName: formattedDirName,
		propsInterfaceName,
		isInteractionsComponent,
	});

	await vscode.workspace.fs.writeFile(vscode.Uri.file(storiesFilePath), Buffer.from(storiesContent));
}

// Read and return the Handlebars template content
async function readHandlebarsTemplate(config: StoryMateConfig): Promise<string> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const workspacePath = workspaceFolders?.[0] ? workspaceFolders[0].uri.fsPath : "";

	const templatePaths = [path.join(workspacePath, config.templatePath)];

	for (const templatePath of templatePaths) {
		try {
			return await fs.promises.readFile(templatePath, "utf8");
		} catch {}
	}

	// Return imported default template if custom template is not found
	return defaultTemplateSource;
}

// Extract variants and other relevant information from the component file content
function extractVariantsFromFile(fileContent: string, filePath?: string) {
	// Initialize result object
	const variantsData: VariantsData = {
		variants: [],
		defaultVariants: [],
	};

	// Find all constant array declarations
	const variantRegex = /export const ([A-Z][A-Z0-9]*_[A-Z]+):/g;
	let match: RegExpExecArray | null;

	while (true) {
		match = variantRegex.exec(fileContent);
		if (match === null) {
			break;
		}

		const originalName = match[1];
		const nameParts = originalName.split("_");
		const lastPart = nameParts[nameParts.length - 1];

		if (lastPart) {
			variantsData.variants.push({
				key: lastPart.toLowerCase(),
				value: originalName,
			});
		}
	}

	// Sort the variants by key in alphabetical order
	variantsData.variants.sort((a, b) => a.key.localeCompare(b.key));

	// Extract defaultVariants
	const defaultVariantsRegex = /defaultVariants:\s*{([^}]+)}/;
	const defaultVariantsMatch = fileContent.match(defaultVariantsRegex);

	if (defaultVariantsMatch) {
		const defaultVariantsPairs = defaultVariantsMatch[1]
			.split(",")
			.map((pair) => pair.trim())
			.filter((pair) => pair)
			.map((pair) => {
				const [key, value] = pair.split(":").map((part) => part.trim());
				return {
					key: key,
					value: value.replace(/['"]/g, ""),
				};
			});

		variantsData.defaultVariants = defaultVariantsPairs;
	}

	// Detect exported props interface
	const propsInterfaceRegex = /export interface (\w+Props)\s*{([^}]+)}/;
	const propsInterfaceMatch = fileContent.match(propsInterfaceRegex);
	const propsInterfaceName = propsInterfaceMatch ? propsInterfaceMatch[1] : null;

	// Detect if component is in interactions folder
	const isInteractionsComponent = filePath?.toLowerCase().includes("interactions");

	return {
		variantsData,
		propsInterfaceName,
		isInteractionsComponent,
	};
}

// // Update the companion file based on the component file content
// async function updateCompanionFile(componentFile: vscode.Uri, companionFile: vscode.Uri, config: StoryMateConfig) {
// 	try {
// 		const fileDir = path.dirname(componentFile.fsPath);

// 		const workspaceFolders = vscode.workspace.workspaceFolders;
// 		if (!workspaceFolders?.length) {
// 			throw new Error("No workspace folder found");
// 		}

// 		const templateContent = await readHandlebarsTemplate(config);
// 		const template = Handlebars.compile(templateContent);

// 		const componentName = path.basename(componentFile.fsPath, path.extname(componentFile.fsPath));

// 		// const dirName = path.basename(path.dirname(componentFile.fsPath));
// 		// // Format the directory name to have a capitalized first letter (e.g., "Interactions")
// 		// const formattedDirName = dirName.charAt(0).toUpperCase() + dirName.slice(1);

// 		const dirName = getRelativeDirName(componentFile, config.watchDirectories);

// 		const componentContent = await vscode.workspace.fs.readFile(componentFile);
// 		const { variantsData, propsInterfaceName, isInteractionsComponent } = extractVariantsFromFile(
// 			componentContent.toString(),
// 			fileDir
// 		);

// 		// Extract the URL from the component content
// 		const companionContent = await vscode.workspace.fs.readFile(companionFile);
// 		const urlMatch = companionContent.toString().match(/type:\s*'figma',\s*url:\s*'([^']+)'/);
// 		const figmaUrl = urlMatch ? urlMatch[1] : "";

// 		const updatedStoriesContent = template({
// 			componentName,
// 			variants: variantsData.variants,
// 			defaultVariants: variantsData.defaultVariants,
// 			dirName: dirName,
// 			propsInterfaceName,
// 			isInteractionsComponent,
// 			figmaUrl,
// 		});

// 		await vscode.workspace.fs.writeFile(companionFile, Buffer.from(updatedStoriesContent));
// 	} catch (error) {
// 		const errorMessage = error instanceof Error ? error.message : "Unknown error";
// 		vscode.window.showErrorMessage(`StoryMate: Failed to update companion files - ${errorMessage}`);
// 		throw error;
// 	}
// }

// // Find companion files for the given component file
// async function findCompanionFiles(componentFile: vscode.Uri): Promise<vscode.Uri[]> {
// 	const componentDir = path.dirname(componentFile.fsPath);
// 	const componentName = path.basename(componentFile.fsPath, path.extname(componentFile.fsPath));

// 	const companionPattern = new vscode.RelativePattern(componentDir, `${componentName}.stories.tsx`);

// 	return await vscode.workspace.findFiles(companionPattern);
// }

// // Get relative path from watch directory to component file
// const getRelativeDirName = (componentFile: vscode.Uri, watchDirectories: string[]): string => {
// 	const filePath = componentFile.fsPath;

// 	// Find the matching watch directory
// 	const watchDir = watchDirectories.find((dir) => filePath.includes(dir));
// 	if (!watchDir) {
// 		return path.basename(path.dirname(filePath));
// 	}

// 	// Get relative path from watch directory
// 	const relativePath = path.relative(watchDir, path.dirname(filePath));

// 	// Split into segments and filter out empty strings
// 	const segments = relativePath.split(path.sep).filter(Boolean);

// 	// Format each segment with capitalized first letter
// 	const formattedSegments = segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

// 	return formattedSegments.join("/");
// };

export function deactivate() {}
