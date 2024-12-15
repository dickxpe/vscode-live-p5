import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import * as parser from './code-parser';
import * as fs from 'fs';
import { existsSync, createWriteStream, writeFileSync, readFileSync } from "fs";
import { timeStamp } from 'console';
import { open } from 'openurl';

let panel: any;
let activeEditor: vscode.TextEditor;
const outputChannel = vscode.window.createOutputChannel('LIVE P5');

async function listFilesRecursively(folderUri: vscode.Uri): Promise<string[]> {
  const entries = await vscode.workspace.fs.readDirectory(folderUri);
  const filePromises = entries.map(async ([name, type]) => {

    const filePath = path.join(folderUri.fsPath, name);
    const fileUri = vscode.Uri.file(filePath);
    if (type === vscode.FileType.Directory) {
      return listFilesRecursively(fileUri); // Recurse into directories
    } else if (type === vscode.FileType.File) {
      return [fileUri.fsPath];
    }
    return [];
  });

  const files = await Promise.all(filePromises);
  return files.flat();
}

export function activate(context: vscode.ExtensionContext): void {

  const webviewPanelMap = new Map<string, vscode.WebviewPanel>();

  // Create the status bar item
  let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  myStatusBarItem.text = "P5 Reference";
  myStatusBarItem.command = 'extension.openP5Ref';
  myStatusBarItem.color = "#FF0000";
  myStatusBarItem.show();

  // Register the command that opens the URL
  let disposable = vscode.commands.registerCommand('extension.openP5Ref', () => {
    vscode.env.openExternal(vscode.Uri.parse(`https://p5js.org/reference/`));
  });

  // Register the "openSelectedText" command for the context menu
  let openSelectedTextCommand = vscode.commands.registerCommand('extension.openSelectedText', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.selection && !editor.selection.isEmpty) {
      let search = encodeURIComponent(editor.document.getText(editor.selection));
      vscode.env.openExternal(vscode.Uri.parse(`https://p5js.org/search/?term=${search}`));
    }
  });

  context.subscriptions.push(myStatusBarItem);
  context.subscriptions.push(disposable);
  context.subscriptions.push(openSelectedTextCommand);

  const setCustomContext = () => {
    let regexSetup = /\s*function\s+setup\s*\(\s*\)\s*\{/g;
    let regexDraw = /\s*function\s+draw\s*\(\s*\)\s*\{/g;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.commands.executeCommand('setContext', 'isP5js', false);
      return;
    }

    const documentText = editor.document.getText();
    const containsFunction = regexDraw.test(documentText) || regexSetup.test(documentText);

    vscode.commands.executeCommand('setContext', 'isP5js', containsFunction);
  };

  setCustomContext();

  outputChannel.clear();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  let createProject = vscode.commands.registerCommand(
    "extension.create-jsconfig",
    async () => {
      try {
        // creates a jsonconfig that tells vscode where to find the types file
        const jsconfig = {
          "compilerOptions": {
            "target": "es6",
            "checkJs": true,
          },
          include: [
            "*.js",
            "**/*.js",
            path.join(context.extensionPath, "p5types", "global.d.ts"),
          ],
        };
        fs.mkdirSync(workspaceFolder.uri.fsPath + "/common", { recursive: true });
        createEmptyFile(workspaceFolder.uri.fsPath + "/common/utils.js");
        const jsconfigPath = path.join(workspaceFolder.uri.fsPath, "jsconfig.json");

        writeFileSync(vscode.Uri.file(jsconfigPath).fsPath, JSON.stringify(jsconfig, null, 2));

      } catch (e) {
        console.error(e);
      }
    });

  const assetsPath = vscode.Uri.file(
    path.join(context.extensionPath, 'assets')
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const documentUri = editor.document.uri.toString();
        const panel = webviewPanelMap.get(documentUri);
        if (panel) {
          panel.reveal(vscode.ViewColumn.Two);
        }
      }
    })
  );

  //this has to run each time the createHtml is called.

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.live-p5', async () => {
      activeEditor = vscode.window.activeTextEditor;
      let activeFilePath = activeEditor.document.fileName
      let activeFilename = activeFilePath.substring(activeFilePath.lastIndexOf('\\') + 1, activeFilePath.length);

      const documentUri = activeEditor.document.uri.toString();

      panel = vscode.window['createWebviewPanel'](
        'extension.live-p5',
        'LIVE: ' + activeFilename,
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'assets')),
            vscode.Uri.file(path.join(context.extensionPath, 'node_modules')),
            vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'common'))
          ],
          retainContextWhenHidden: true
        },
      );

      webviewPanelMap.set(documentUri, panel);

      const fileName = vscode.window.activeTextEditor.document.fileName;
      // vscode.workspace.createFileSystemWatcher(fileName).onDidChange(_ => {
      //   documentChanged(assetsPath);
      // })

      panel.webview.html = await createHtml(getText(), assetsPath);

      outputChannel.show(true);

      // Listen for messages from the webview
      panel.webview.onDidReceiveMessage(
        (message) => {
          if (message.type === 'log') {

            outputChannel.appendLine(`[${new Date().toLocaleTimeString('eo', { hour12: false })
              } LOG from ${activeFilename} ]: ${message.message.join(' ')} `);
          } else if (message.type === 'error') {
            outputChannel.appendLine(
              `[${new Date().toLocaleTimeString('eo', { hour12: false })} ERROR in ${activeFilename}]: ${message.message} (at ${message.filename}:${message.line}:${message.column})`
            );
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );

  vscode.workspace.onDidOpenTextDocument((document) => {
    // A new js file should always be opened on the left side as tab
  });

  vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
    try {
      const html = await createHtml(getText(), assetsPath);  // Await the HTML generation
      panel.webview.html = html;
      outputChannel.clear();
    } catch (error) {
      outputChannel.appendLine(`[Error]: Error creating HTML on save ${error.message}`)
    }
  });
  // vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
  //   try {
  //     await documentChanged(assetsPath);  // Await the document change handling
  //   } catch (error) {
  //     outputChannel.appendLine(`[Error]: ${ error.message } - ${ activeEditor.document.fileName } `);
  //   }
  // });


  // Update the context when the active editor changes
  vscode.window.onDidChangeActiveTextEditor(setCustomContext, null, context.subscriptions);

  // Update the context when the document changes
  vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document === vscode.window.activeTextEditor?.document) {
      setCustomContext();
    }
  }, null, context.subscriptions);

  // Initial check
  setCustomContext();


}

function createEmptyFile(filePath) {
  try {
    // Write an empty string to create an empty file
    fs.writeFileSync(filePath, '', { flag: 'w' }); // 'w' ensures it overwrites if the file exists
    console.log(`Empty file created at: ${filePath} `);
  } catch (error) {
    console.error('Error creating empty file:', error);
  }
}

async function documentChanged(assetsPath: vscode.Uri): Promise<void> {
  const text = getText();

  if (parser.codeHasChanged(text)) {
    try {
      const html = await createHtml(text, assetsPath);  // Await the HTML generation
      panel.webview.html = html;
    } catch (error) {
      vscode.window.showErrorMessage(`Error creating HTML: ${error.message} `);
    }
  } else {
    panel.webview.postMessage({
      vars: JSON.stringify(parser.getVars(text)),
    });
  }
}

function getText(): string {

  const document = activeEditor.document;

  const text = document.getText();

  const languageId = document.languageId;

  if (languageId === 'typescript') {
    const result = ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS }
    });
    return result.outputText;
  }

  return text;
}


async function createHtml(text: string, assetsPath: vscode.Uri) {

  let regex = /\s*function\s+setup\s*\(\s*\)\s*\{/g;
  if (!text.includes("createCanvas(")) {
    if (!regex.test(text)) {
      text = "function setup() { createCanvas(windowWidth - 1, windowHeight - 4);} " + text;
    } else {
      text = text.replace(regex, "function setup() { createCanvas(windowWidth - 1, windowHeight - 4);");
    }
  }
  let code = parser.parseCode(text);


  const scripts = [
    path.join(assetsPath.path, 'p5.min.js')
  ];

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Workspace folder not found");
    }

    const files = await listFilesRecursively(vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, "common")));
    files.forEach(file => scripts.push(file));

    const scriptTags = scripts
      .map(s => panel.webview.asWebviewUri(vscode.Uri.file(s)))
      .map(uri => `<script src='${uri}'></script>`)
      .join('\n');

    const html = `<!DOCTYPE html>
      <html>
        <head>
          ${scriptTags}
          <style>body {padding: 0; margin: 0; } .p5Canvas{ background-color: white;}</style>
        </head>
        <body></body>
        <script>
          ${code}
        </script>
        <script>
        
          const vscode = acquireVsCodeApi();

          // Capture JavaScript errors
          window.addEventListener('error', (event) => {
              const message = {
                  type: 'error',
                  message: event.message,
                  line: event.lineno,
                  column: event.colno,
              };
              vscode.postMessage(message);
          });

          // Override console.log
          const originalConsoleLog = console.log;
          console.log = (...args) => {
              vscode.postMessage({ type: 'log', message: args });
              originalConsoleLog(...args);
          };

          window.addEventListener('message', event => {
            const vars = JSON.parse(event.data.vars);
            for (const k in vars) {
              __AllVars[k] = vars[k];
            }
          });
        </script>
      </html><!-- ${Math.random()} -->`;

    return html;

  } catch (error) {
    outputChannel.appendLine(`[]: Error gettings resources ${error.message}`)
  }
}

export function deactivate(): void {
  panel = null;
}
