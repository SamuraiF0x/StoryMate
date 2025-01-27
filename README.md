# StoryMate

StoryMate is a Visual Studio Code extension that automatically generates Storybook stories for React components.

## Features

- Automatically generates `.stories.tsx` files for new React components.
- Configurable directories to watch for new files.

## Configuration

You can configure the directories to watch for new files by adding the following settings to your `settings.json`:

- storyMate.watchDirectories
- storyMate.templatePath
- storyMate.fileExtensions

Defaults are configured as follows:

```json
{
 "storyMate.watchDirectories": ["ui/src/components"],
 "storyMate.templatePath": "apps/storybook/.storybook/storyTemplate.hbs",
 "storyMate.fileExtensions": [".tsx", ".jsx"]
}
```

> [!TIP]
> Use vscode file nesting for nice organization without folders.

## Usage

Create a new React component file (e.g., `Button.tsx`) in one of the configured directories.
The extension will automatically generate a companion `.stories.tsx` file (e.g., `Button.stories.tsx`) in the same directory.

> [!NOTE]  
> It is expected that [addon-designs](https://storybookjs.github.io/addon-designs/?path=/docs/docs-quick-start--docs) is installed and configured in Storybook

### Example

Given a component file `Button.tsx` in the `ui/src/components/interactions` directory, the extension will generate a `Button.stories.tsx` file with the following content:

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

## TODO

- [x] auto-edit story on save
  - [x] read `variants` and `defaultVariants` (and props from Component.tsx ?)
  - [x] add `variants` and `defaultVariants` to story
  - [ ] make sure the current story figma url isn't overwritten
  - [ ] make sure the current story args children string isn't overwritten
  - [ ] add folder-based story title
- [ ] update README
  - [ ] add available handlebars
- [ ] [bundle extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [ ] add import `defaultStoryTemplate.hbs` to `extension.ts`
- [ ] check if `settings.json` configuration works
- [ ] check if custom template can be read from custom path
- [ ] move functions to separate files (cleaner code)
- [ ] make sure the current story isn't overwritten (update only `argTypes` and `args`)
