const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let currentPanel = undefined;
let selectedProject = undefined;
let projectStructure = undefined;

function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('coderay.openGraphWebview', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        // Check if there are any workspace folders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No projects found in the workspace.");
            return;
        }
    
        let projectNames = [];
        if (workspaceFolders.length === 1) {
            const baseFolder = workspaceFolders[0];
            projectNames.push(baseFolder.name);
            const basePath = baseFolder.uri.fsPath;
            try {
                // Read the base folder and get subfolders
                const items = fs.readdirSync(basePath, { withFileTypes: true });
                const childFolders = items
                    .filter(item => item.isDirectory())
                    .map(item => item.name);
                projectNames.push(...childFolders);
            } catch (err) {
                vscode.window.showErrorMessage("Error reading the workspace folder.");
                return;
            }
        } else {
            // Add all workspace folder names
            projectNames = workspaceFolders.map(folder => folder.name);
        }
    
        // Show a quick pick to select a project
        selectedProject = await vscode.window.showQuickPick(projectNames, {
            placeHolder: 'Select a project (workspace or subfolder)'
        });
        if (!selectedProject) {
            return;
        }

        console.log("Selected project:", selectedProject);
        vscode.window.showInformationMessage(`Selected project: ${selectedProject}`);
        projectStructure = getProjectStructure(selectedProject); 

        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;
            
        // If the panel is already open, reveal it
        if (currentPanel) {
            currentPanel.reveal(columnToShowIn);
        } else {
            // Create a new webview panel
            currentPanel = vscode.window.createWebviewPanel(
                'coderayGraphPanel',
                'CodeRay Graph',
                columnToShowIn,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src')]
                }
            );
            currentPanel.webview.html = getGraphHtmlFromFile(currentPanel.webview, context.extensionUri, projectStructure);
            currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
        }
    }));
  
    // Create an empty tree view
    const emptyTreeDataProvider = new EmptyTreeDataProvider();
    const treeView = vscode.window.createTreeView('coderayActionsView', { treeDataProvider: emptyTreeDataProvider, showCollapseAll: false });
    context.subscriptions.push(treeView);
    context.subscriptions.push(treeView.onDidChangeVisibility(e => {
        if (e.visible) {
            vscode.commands.executeCommand('coderay.openGraphWebview');
        }
    }));
}

class EmptyTreeDataProvider {
    getTreeItem(element) { return element; }
    getChildren(element) { return Promise.resolve([]); }
}

function getProjectStructure(selectedName) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let targetFolderPath = null;

    // Find the target folder path by matching the selected name
    for (const folder of workspaceFolders) {
        if (folder.name.trim().toLowerCase() === selectedName.trim().toLowerCase()) {
            targetFolderPath = folder.uri.fsPath;
            break;
        }
    }
    
    // If not found, search recursively
    if (!targetFolderPath) {
        for (const folder of workspaceFolders) {
            const found = findFolderRecursively(folder.uri.fsPath, selectedName);
            if (found) {
                targetFolderPath = found;
                break;
            }
        }
    }
    
    // If still not found, show an error
    if (!targetFolderPath) {
        const availableProjects = workspaceFolders.map(folder => folder.name).join(', ');
        vscode.window.showErrorMessage(`No project found with name ${selectedName}. Available projects: ${availableProjects}`);
        return null;
    }
    
    // Traverse the directory to build the project structure
    function traverseDir(currentPath) {
        const baseName = path.basename(currentPath);
        let node = { name: baseName };
    
        try {
            const stats = fs.statSync(currentPath);
            if (stats.isDirectory()) {
                const items = fs.readdirSync(currentPath, { withFileTypes: true });
                const children = [];
                for (const item of items) {
                    if (['node_modules', '.git', 'dist', 'build'].includes(item.name)) continue;
                    children.push(traverseDir(path.join(currentPath, item.name)));
                }
                if (children.length > 0) {
                    node.children = children;
                }
            }
        } catch (e) {
            console.error("Error reading " + currentPath, e);
        }
        return node;
    }
    
    return traverseDir(targetFolderPath);
}

function findFolderRecursively(dirPath, targetName) {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                if (item.name.trim().toLowerCase() === targetName.trim().toLowerCase()) {
                    return path.join(dirPath, item.name);
                }
                const found = findFolderRecursively(path.join(dirPath, item.name), targetName);
                if (found) return found;
            }
        }
    } catch (e) {
        console.error("Error reading " + dirPath, e);
    }
    return null;
}

function getGraphHtmlFromFile(webview, extensionUri, projectStructure) {
    const nonce = getNonce();
    const cspSource = webview.cspSource;
    const htmlPathOnDisk = vscode.Uri.joinPath(extensionUri, 'src', 'treeView.html');
    const htmlFilePath = htmlPathOnDisk.fsPath;
    const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'src', 'treeRenderer.js');
    const d3Uri = 'https://d3js.org/d3.v7.min.js';
    const treeScriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https: data:; script-src ${cspSource} 'nonce-${nonce}' https://d3js.org; connect-src 'self';`;
    
    try {
        let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        htmlContent = htmlContent.replace(/{{csp}}/g, csp)
                                 .replace(/{{nonce}}/g, nonce)
                                 .replace(/{{d3Uri}}/g, d3Uri)
                                 .replace(/{{treeScriptUri}}/g, treeScriptUri.toString())
                                 .replace(/{{projectStructure}}/g, JSON.stringify(projectStructure));
        return htmlContent;
    } catch (err) {
        return `<html><body><h1>Error loading view</h1><p>${err}</p></body></html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function deactivate() {
    if (currentPanel) { currentPanel.dispose(); }
}

module.exports = {
    activate,
    deactivate
};