import * as vscode from "vscode";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
	// Listen for file creation events
	const disposable = vscode.workspace.onDidCreateFiles(async (event) => {
		// Fetch user-configured directories to watch from the settings (e.g., "storyMate.watchDirectories")
		const configs = vscode.workspace.getConfiguration("storyMate");
		const watchPaths: string[] = configs.get("watchDirectories") || [];

		// Check if the user has configured any directories to watch
		if (!Array.isArray(watchPaths) || watchPaths.length === 0) {
			console.warn("storyMate.watchDirectories is not properly configured. No files will be processed.");
			return;
		}

		for (const file of event.files) {
			// Check if the created file's path matches any of the configured watch directories
			if (watchPaths.some((watchPath) => file.path.includes(watchPath))) {
				try {
					// Call the function to create a companion file (e.g., .stories.tsx)
					await createCompanionFile(file);
				} catch (error) {
					console.error(`Failed to create companion file for ${file.path}:`, error);
				}
			}
		}
	});

	// Register the event listener as a subscription to clean it up when the extension is deactivated
	context.subscriptions.push(disposable);
}

async function createCompanionFile(originalFile: vscode.Uri) {
	// Extract file details
	// - file name (e.g., "Button.tsx")
	const fileName = path.basename(originalFile.fsPath);
	// - directory path of the original file (e.g., "ui/src/components")
	const fileDir = path.dirname(originalFile.fsPath);

	// Only process .tsx files that aren't already stories
	if (!fileName.endsWith(".tsx") || fileName.includes(".stories.")) return;

	// Generate the name and full path for the companion stories file (e.g., "Button.stories.tsx")
	const storiesFileName = fileName.replace(".tsx", ".stories.tsx");
	const storiesFilePath = path.join(fileDir, storiesFileName);

	// Generate stories template
	// - extract the component name from the original file name (e.g., "Button")
	const componentName = fileName.replace(".tsx", "");
	// - define a constant name for component variants, based on the component name (e.g., "BUTTON_VARIANTS")
	const componentVariants = `${componentName.toUpperCase()}_VARIANTS`;

	// Extract directory name and capitalize first letter
	// Extract the name of the directory where the component resides (e.g., "interactions")
	const dirName = path.basename(path.dirname(fileDir));
	// Format the directory name to have a capitalized first letter (e.g., "Interactions")
	const formattedDirName = dirName.charAt(0).toUpperCase() + dirName.slice(1);

	// Storybook template
	const storiesTemplate = `import type { Meta, StoryObj } from '@storybook/react';
import ${componentName}, { ${componentVariants} } from './${componentName}';

const meta = { 
    title: '${formattedDirName}/${componentName}',
    component: ${componentName},
    argTypes: {
        variant: { 
            options: ${componentVariants}, 
            control: 'select' 
        },
        onPress: { action: 'Pressed' },
    },
    args: { 
        children: 'Default Text' 
    },
} satisfies Meta<typeof ${componentName}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
    parameters: {
        design: {
            type: 'figma',
            url: 'REPLACE_WITH_FIGMA_URL',
            allowFullscreen: true,
        },
    },
};
`;

	// Write stories file
	try {
		await vscode.workspace.fs.writeFile(vscode.Uri.file(storiesFilePath), Buffer.from(storiesTemplate));
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to create stories file: ${error}`);
	}
}

export function deactivate() {}
