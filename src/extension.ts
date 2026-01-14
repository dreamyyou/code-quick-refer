// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { generateReferencesCommand, copyLineNumberCommand } from './references';
import { formatHtmlCommand } from './htmlFormatter';
import { initializeFavorites } from './folderFavorites';
import { initializeStatusBarFavorites } from './statusBarFavorites';

function showHelloWorldMessage() {
  vscode.window.showInformationMessage('Hello World from code-quick-refer!');
}

function handleOpenError(error: Error) {
  vscode.window.showErrorMessage(`打开文件失败: ${error.message}`);
}

function openWithSystemCommand(uri: vscode.Uri) {
  if (!uri) {
    vscode.window.showErrorMessage('未选择文件');
    return;
  }
  const filePath = uri.fsPath;
  const child = spawn('open', [filePath]);
  child.on('error', handleOpenError);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "code-quick-refer" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('code-quick-refer.helloWorld', showHelloWorldMessage);
  const generateReferencesDisposable = vscode.commands.registerCommand(
    'code-quick-refer.generateReferences',
    generateReferencesCommand,
  );
  const copyLineNumberDisposable = vscode.commands.registerCommand(
    'code-quick-refer.copyLineNumber',
    copyLineNumberCommand,
  );
  const formatHtmlDisposable = vscode.commands.registerCommand('code-quick-refer.formatHtml', formatHtmlCommand);
  const openWithSystemDisposable = vscode.commands.registerCommand(
    'code-quick-refer.openWithSystem',
    openWithSystemCommand,
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(generateReferencesDisposable);
  context.subscriptions.push(copyLineNumberDisposable);
  context.subscriptions.push(formatHtmlDisposable);
  context.subscriptions.push(openWithSystemDisposable);

  // 初始化文件夹收藏功能（活动栏）
  const favoritesDisposables = initializeFavorites(context);
  context.subscriptions.push(...favoritesDisposables);

  // 初始化状态栏收藏功能
  const statusBarFavoritesDisposables = initializeStatusBarFavorites(context);
  context.subscriptions.push(...statusBarFavoritesDisposables);
}

// This method is called when your extension is deactivated
export function deactivate() {}
