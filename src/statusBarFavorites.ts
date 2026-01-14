import * as vscode from 'vscode';
import * as path from 'path';

const MAX_STATUS_BAR_FAVORITES = 5;
const STORAGE_KEY = 'statusBarFavorites.items';

interface StatusBarFavorite {
  path: string;
  name: string;
}

type StatusBarFavoritesData = StatusBarFavorite[];
type StatusBarFavoritePredicate = (item: StatusBarFavorite) => boolean;

export class StatusBarFavoritesManager {
  private items: StatusBarFavoritesData;
  private context: vscode.ExtensionContext;
  private statusBarItems: vscode.StatusBarItem[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.items = this.load();
    this.createStatusBarItems();
  }

  private load(): StatusBarFavoritesData {
    const data = this.context.workspaceState.get<StatusBarFavoritesData>(STORAGE_KEY);
    if (data && Array.isArray(data)) {
      return data;
    }
    return [];
  }

  private save(): void {
    this.context.workspaceState.update(STORAGE_KEY, this.items);
  }

  private createStatusBarItems(): void {
    // 清除旧的状态栏项目
    this.disposeStatusBarItems();

    // 为每个收藏创建状态栏项目
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 - i);
      statusBarItem.text = `$(folder) ${item.name}`;
      statusBarItem.tooltip = `${item.path}\n点击跳转到资源管理器`;
      statusBarItem.command = {
        command: 'code-quick-refer.statusBarFavoriteClick',
        arguments: [item.path, i],
        title: '跳转到文件夹',
      };
      statusBarItem.show();
      this.statusBarItems.push(statusBarItem);
    }
  }

  private disposeStatusBarItems(): void {
    for (const item of this.statusBarItems) {
      item.dispose();
    }
    this.statusBarItems = [];
  }

  addFavorite(uri: vscode.Uri): boolean {
    const folderPath = uri.fsPath;
    const folderName = path.basename(folderPath);

    // 检查是否已收藏
    const existingIndex = this.items.findIndex(createPathMatcher(folderPath));
    if (existingIndex !== -1) {
      vscode.window.showInformationMessage(`文件夹 "${folderName}" 已在状态栏收藏中`);
      return false;
    }

    // 检查是否已满
    if (this.items.length >= MAX_STATUS_BAR_FAVORITES) {
      vscode.window.showWarningMessage(`状态栏收藏已满（最多 ${MAX_STATUS_BAR_FAVORITES} 个）`);
      return false;
    }

    this.items.push({ path: folderPath, name: folderName });
    this.save();
    this.createStatusBarItems();
    vscode.window.showInformationMessage(`已添加 "${folderName}" 到状态栏`);
    return true;
  }

  removeFavorite(index: number): void {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    const folderName = this.items[index].name;
    this.items.splice(index, 1);
    this.save();
    this.createStatusBarItems();
    vscode.window.showInformationMessage(`已从状态栏移除 "${folderName}"`);
  }

  getItems(): StatusBarFavoritesData {
    return this.items;
  }

  dispose(): void {
    this.disposeStatusBarItems();
  }
}

function itemHasPath(targetPath: string, item: StatusBarFavorite): boolean {
  return item.path === targetPath;
}

function createPathMatcher(targetPath: string): StatusBarFavoritePredicate {
  return itemHasPath.bind(null, targetPath);
}

function revealFolder(folderPath: string): void {
  const uri = vscode.Uri.file(folderPath);
  vscode.commands.executeCommand('revealInExplorer', uri);
}

function addStatusBarFavoriteHandler(manager: StatusBarFavoritesManager, uri: vscode.Uri): void {
  if (!uri) {
    vscode.window.showErrorMessage('未选择文件夹');
    return;
  }
  manager.addFavorite(uri);
}

function statusBarFavoriteClickHandler(manager: StatusBarFavoritesManager, folderPath: string, index: number): void {
  // 跳转到文件夹
  revealFolder(folderPath);
}

type AddStatusBarFavoriteHandler = (uri: vscode.Uri) => void;
type StatusBarClickHandler = (folderPath: string, index: number) => void;
type ManageFavoritesHandler = () => Promise<void>;

export function createAddStatusBarFavoriteCommand(manager: StatusBarFavoritesManager): AddStatusBarFavoriteHandler {
  return addStatusBarFavoriteHandler.bind(null, manager);
}

export function createStatusBarFavoriteClickCommand(manager: StatusBarFavoritesManager): StatusBarClickHandler {
  return statusBarFavoriteClickHandler.bind(null, manager);
}

interface QuickPickFavoriteItem extends vscode.QuickPickItem {
  index: number;
}

function createQuickPickItem(item: StatusBarFavorite, index: number): QuickPickFavoriteItem {
  return {
    label: `$(folder) ${item.name}`,
    description: item.path,
    index: index,
  };
}

async function manageFavoritesHandler(manager: StatusBarFavoritesManager): Promise<void> {
  const items = manager.getItems();
  if (items.length === 0) {
    vscode.window.showInformationMessage('状态栏没有收藏的文件夹');
    return;
  }

  const quickPickItems: QuickPickFavoriteItem[] = [];
  for (let i = 0; i < items.length; i++) {
    quickPickItems.push(createQuickPickItem(items[i], i));
  }

  const selected = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: '选择要移除的文件夹',
    title: '管理状态栏收藏',
  });

  if (selected) {
    manager.removeFavorite(selected.index);
  }
}

export function createManageFavoritesCommand(manager: StatusBarFavoritesManager): ManageFavoritesHandler {
  return manageFavoritesHandler.bind(null, manager);
}

export function initializeStatusBarFavorites(context: vscode.ExtensionContext): vscode.Disposable[] {
  const manager = new StatusBarFavoritesManager(context);
  const disposables: vscode.Disposable[] = [];

  // 注册命令
  disposables.push(
    vscode.commands.registerCommand(
      'code-quick-refer.addStatusBarFavorite',
      createAddStatusBarFavoriteCommand(manager),
    ),
  );
  disposables.push(
    vscode.commands.registerCommand(
      'code-quick-refer.statusBarFavoriteClick',
      createStatusBarFavoriteClickCommand(manager),
    ),
  );
  disposables.push(
    vscode.commands.registerCommand('code-quick-refer.manageStatusBarFavorites', createManageFavoritesCommand(manager)),
  );

  // 添加 manager 的 dispose
  disposables.push({ dispose: manager.dispose.bind(manager) });

  return disposables;
}
