# Amazon Return Label Printer

A Firefox extension that simplifies Amazon return pages for printing labels and relevant information.

## Features

- Extracts only the essential return label and item information
- Handles multiple returns on a single page
- Properly formats the page for printing
- Adds a print button for easy access
- Optimized for Amazon.de return pages

## Installation

1. Open Firefox and navigate to `about:debugging`
2. Click on "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Select any file from the extension directory (e.g., `manifest.json`)

## Usage

1. Navigate to your Amazon returns page (e.g., `https://www.amazon.de/gp/css/returns/...`)
2. The page will automatically be simplified to show only return labels and item information
3. Click the "Drucken (Print)" button in the top-right corner or press Ctrl+P
4. In the print dialog, ensure the following settings:
   - Layout: Portrait
   - Paper size: A4
   - Margins: None or Minimal
   - Background graphics: Enabled (to print any barcodes)

## Development

To make changes to the extension:

1. Edit the relevant files:
   - `content.js`: Main logic for modifying the page
   - `styles.css`: Styling for the print view
   - `manifest.json`: Extension configuration

2. After making changes, reload the temporary extension in `about:debugging` by clicking the "Reload" button.

## Known Issues

- The extension only works on Amazon.de return pages
- Some styling might need adjustment for different screen sizes

## License

This project is open source and available under the MIT License.
