// Track if we've already processed the page
let isProcessed = false;

// Function to create print button
function createPrintButton() {
    const printButton = document.createElement('button');
    printButton.textContent = 'Drucken (Print)';
    printButton.style.position = 'fixed';
    printButton.style.top = '10px';
    printButton.style.right = '10px';
    printButton.style.padding = '10px 20px';
    printButton.style.backgroundColor = '#FF9900';
    printButton.style.border = 'none';
    printButton.style.borderRadius = '4px';
    printButton.style.cursor = 'pointer';
    printButton.style.zIndex = '1000';
    printButton.onclick = () => {
        window.print();
    };
    return printButton;
}

// Function to process the return label page
function processReturnLabelPage() {
    const mainLabelImages = document.querySelectorAll('img.return-label-image[alt="Rücksendeetikett"], img.return-label-image.cut-line-sign');

    if (isProcessed || mainLabelImages.length === 0) {
        return;
    }
    isProcessed = true;

    const printContainer = document.createElement('div');
    printContainer.id = 'print-container';

    mainLabelImages.forEach((mainLabelImg, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'return-wrapper';

        // 1. Add Main Label Image
        const mainLabelContainer = document.createElement('div');
        mainLabelContainer.className = 'a-section a-spacing-none a-text-center print-element';
        mainLabelContainer.appendChild(mainLabelImg.cloneNode(true));
        wrapper.appendChild(mainLabelContainer);

        // 2. Find and Add Item Table
        // Assumes table is a sibling to the mainLabelImg's container or a sibling to a few parents up.
        let currentElement = mainLabelImg.parentElement;
        let itemTable = null;
        for (let i = 0; i < 3 && currentElement; i++) { // Check current element's siblings then parent's siblings
            let sibling = currentElement.nextElementSibling;
            while (sibling) {
                if (sibling.matches('table.a-bordered')) {
                    itemTable = sibling;
                    break;
                }
                // Check if table is a child of sibling (e.g. if sibling is a wrapper div)
                const childTable = sibling.querySelector('table.a-bordered');
                if(childTable){
                    itemTable = childTable;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
            if (itemTable) break;
            currentElement = currentElement.parentElement;
        }

        if (itemTable) {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'print-element';
            tableContainer.appendChild(itemTable.cloneNode(true));
            wrapper.appendChild(tableContainer);
        }

        // 3. Find and Add Overview Image (Rücksendungsübersicht)
        let overviewImage = null;

        // Attempt 1: Search in the main label's containing section and its subsequent siblings.
        // Try to get a block-level .a-section, not the immediate image wrapper.
        let currentSearchElement = mainLabelImg.closest('.a-section:not(.a-spacing-none):not(.a-text-center)');
        if (!currentSearchElement) { // Fallback if the specific selector fails
            currentSearchElement = mainLabelImg.closest('.a-section');
        }

        for (let i = 0; i < 10 && currentSearchElement; i++) { // Check current and up to 9 siblings
            const imgs = currentSearchElement.querySelectorAll('img[alt="Rücksendungsübersicht"]');
            for (const img of imgs) {
                if (!img.isSameNode(mainLabelImg)) {
                    if (img.classList.contains('return-label-image')) { // Prefer with class
                        overviewImage = img;
                        break;
                    }
                    if (!overviewImage) { // Take first one found if no preferred yet
                        overviewImage = img;
                    }
                }
            }
            if (overviewImage && overviewImage.classList.contains('return-label-image')) {
                break; // Found a preferred image, stop searching siblings
            }
            if (overviewImage && i > 0) {
                 // Found a non-preferred one in a sibling, good enough if no preferred is found later in this sibling scan
            }

            currentSearchElement = currentSearchElement.nextElementSibling;
            // Ensure next element is a plausible container (e.g., .a-section or .a-box)
            while (currentSearchElement && !currentSearchElement.matches('.a-section, .a-box')) {
                currentSearchElement = currentSearchElement.nextElementSibling;
            }
        }

        // Attempt 2: Fallback to a broader scope if not found via sibling search
        if (!overviewImage) {
            const broaderScope = mainLabelImg.closest('div[id^="return-package-"], div.return-shipment, div.a-box, body');
            if (broaderScope) {
                const imgs = broaderScope.querySelectorAll('img[alt="Rücksendungsübersicht"]');
                for (const img of imgs) {
                    if (!img.isSameNode(mainLabelImg)) {
                        if (img.classList.contains('return-label-image')) {
                            overviewImage = img;
                            break;
                        }
                        if (!overviewImage) {
                            overviewImage = img;
                        }
                    }
                }
            }
        }
        
        if (overviewImage) {
            const overviewContainer = document.createElement('div');
            overviewContainer.className = 'a-section a-spacing-none a-text-center print-element'; // Consistent class for styling
            overviewContainer.appendChild(overviewImage.cloneNode(true));
            wrapper.appendChild(overviewContainer);
        }

        if (mainLabelImages.length > 1 && index < mainLabelImages.length - 1) {
            wrapper.style.pageBreakAfter = 'always';
            wrapper.style.marginBottom = '20px'; // For visual separation on screen if multiple items
        }
        printContainer.appendChild(wrapper);
    });

    if (printContainer.children.length > 0) {
        const originalBodyHTML = document.body.innerHTML;
        document.body.innerHTML = '';
        document.body.appendChild(printContainer);
        document.body.appendChild(createPrintButton());

        const backButton = document.createElement('button');
        backButton.textContent = 'Zurück (Back)';
        backButton.style.position = 'fixed';
        backButton.style.top = '10px';
        backButton.style.right = '150px';
        backButton.style.padding = '10px 20px';
        backButton.style.backgroundColor = '#f0f0f0';
        backButton.style.border = '1px solid #ddd';
        backButton.style.borderRadius = '4px';
        backButton.style.cursor = 'pointer';
        backButton.style.zIndex = '1000';
        backButton.onclick = () => {
            document.body.innerHTML = originalBodyHTML;
            isProcessed = false; 
            // Re-attach observer if needed, or ensure it's robust to this reset
            // For simplicity, full page reload might be an option or re-init observer if it's disconnected.
            // Current observer is on document.body, might need re-check.
        };
        document.body.appendChild(backButton);
    }
}

function initObserver() {
    // Debounced processing for mutations
    let mutationTimeout;
    const observer = new MutationObserver(() => {
        if (document.readyState === 'complete' && !isProcessed) {
            clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(processReturnLabelPage, 500);
        }
    });

    // Observe changes to the body and its children, as content might be loaded dynamically
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(processReturnLabelPage, 500); // Initial attempt
        initObserver(); // Setup observer for dynamic changes
    });
} else {
    setTimeout(processReturnLabelPage, 500); // Initial attempt for already loaded pages
    initObserver(); // Setup observer for dynamic changes
}
