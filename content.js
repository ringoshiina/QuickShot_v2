// Function to find text content by label
function findIdByLabel(label) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while ((node = walker.nextNode())) {
        if (node.textContent.includes(label)) {
            // Found the label, now try to get the value
            // Strategy 1: The value is in the same text node after the label
            let value = node.textContent.split(label)[1].trim();
            if (value) return value;

            // Strategy 2: The value is in the next sibling element or text node
            // This is a simple heuristic and might need adjustment based on specific DOM structure
            let parent = node.parentNode;
            if (parent && parent.nextElementSibling) {
                return parent.nextElementSibling.textContent.trim();
            }
        }
    }
    return null;
}

// Function to extract IDs
function extractIds() {
    let projectId = findIdByLabel("项目编号：") || findIdByLabel("项目名称：");
    let parcelId = findIdByLabel("地块编号：");

    // Fallback for Project ID if label search fails (using previous regex approach as backup)
    if (!projectId) {
        const projectMatch = document.body.innerText.match(/([A-Z0-9]{2,})[-_]/); // Simple fallback regex
        if (projectMatch) projectId = projectMatch[1];
    }

    return { projectId, parcelId };
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getIds") {
        const ids = extractIds();
        sendResponse(ids);
    }
});
