# StoryMate

StoryMate is a Visual Studio Code extension that automatically generates Storybook stories for React components.

## Features

- Automatically generates `.stories.tsx` files for new React components.
- Configurable directories to watch for new files.

## Configuration

You can configure the directories to watch for new files by adding the following setting to your `settings.json`:

```json
{
	"storyMate.watchDirectories": ["ui/src/components"]
}
```

## Usage

Create a new React component file (e.g., Button.tsx) in one of the configured directories.
The extension will automatically generate a companion .stories.tsx file (e.g., Button.stories.tsx) in the same directory.

### Example

Given a component file `Button.tsx` in the `ui/src/components` directory, the extension will generate a `Button.stories.tsx` file with the following content:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import Button, { BUTTON_VARIANTS } from "./Button";

const meta = {
	title: "Interactions/Button",
	component: Button,
	argTypes: {
		variant: {
			options: BUTTON_VARIANTS,
			control: "select",
		},
		onPress: { action: "Pressed" },
	},
	args: {
		children: "Default Text",
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
	parameters: {
		design: {
			type: "figma",
			url: "REPLACE_WITH_FIGMA_URL",
			allowFullscreen: true,
		},
	},
};
```

> [!NOTE]  
> It is expected that the `Button.tsx` will have `BUTTON_VARIANTS` exported.

Export `BUTTON_VARIANTS` as follows:

```tsx
export type ButtonVariant = "primary" | "secondary" | "tertiary";

export const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "secondary", "tertiary"];
```

## Variables used

- `storiesFilePath`: Full path of the new `.stories.tsx` file
- `componentName`: Name of the component (e.g., "Button")
- `componentVariants`: Component variants constant (e.g., "BUTTON_VARIANTS")
- `formattedDirName`: Capitalized directory name (e.g., "Interactions")

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

### Installation

1. Clone this repository.
2. Open the project in Visual Studio Code.
3. Run `npm install` to install the dependencies.
4. Run `npm run compile` to compile the TypeScript code.
5. Press `F5` to start debugging the extension.
