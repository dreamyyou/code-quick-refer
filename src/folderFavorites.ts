import * as vscode from 'vscode';
import * as path from 'path';

const SLOT_COUNT = 5;
const STORAGE_KEY = 'folderFavorites.slots';

interface FavoriteSlot {
  path: string;
  name: string;
}

type FavoritesData = (FavoriteSlot | null)[];
type AddFavoriteHandler = (uri: vscode.Uri) => void;
type RemoveFavoriteHandler = () => void;
type SlotPredicate = (slot: FavoriteSlot | null) => boolean;
type VisibilityChangeHandler = (e: vscode.TreeViewVisibilityChangeEvent) => void;

function isSlotEmpty(slot: FavoriteSlot | null): boolean {
  return slot === null;
}

function slotHasPath(targetPath: string, slot: FavoriteSlot | null): boolean {
  return slot?.path === targetPath;
}

function createSlotPathMatcher(targetPath: string): SlotPredicate {
  return slotHasPath.bind(null, targetPath);
}

export class FavoritesManager {
  private slots: FavoritesData;
  private context: vscode.ExtensionContext;
  private providers: FavoriteSlotProvider[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.slots = this.load();
    this.updateAllVisibility();
  }

  setProviders(providers: FavoriteSlotProvider[]): void {
    this.providers = providers;
  }

  private load(): FavoritesData {
    const data = this.context.workspaceState.get<FavoritesData>(STORAGE_KEY);
    if (data && data.length === SLOT_COUNT) {
      return data;
    }
    return Array(SLOT_COUNT).fill(null) as FavoritesData;
  }

  private save(): void {
    this.context.workspaceState.update(STORAGE_KEY, this.slots);
  }

  private updateAllVisibility(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const visible = this.slots[i] !== null;
      vscode.commands.executeCommand('setContext', `code-quick-refer.slot${i}.visible`, visible);
    }
  }

  private refreshProvider(index: number): void {
    if (this.providers[index]) {
      this.providers[index].refresh();
    }
  }

  addFavorite(uri: vscode.Uri): boolean {
    const folderPath = uri.fsPath;
    const folderName = path.basename(folderPath);

    // 检查是否已收藏
    const existingIndex = this.slots.findIndex(createSlotPathMatcher(folderPath));
    if (existingIndex !== -1) {
      vscode.window.showInformationMessage(`文件夹 "${folderName}" 已在收藏中`);
      return false;
    }

    // 找到第一个空槽
    const emptyIndex = this.slots.findIndex(isSlotEmpty);
    if (emptyIndex === -1) {
      vscode.window.showWarningMessage(`收藏夹已满（最多 ${SLOT_COUNT} 个）`);
      return false;
    }

    this.slots[emptyIndex] = { path: folderPath, name: folderName };
    this.save();
    vscode.commands.executeCommand('setContext', `code-quick-refer.slot${emptyIndex}.visible`, true);
    this.refreshProvider(emptyIndex);
    vscode.window.showInformationMessage(`已添加 "${folderName}" 到收藏夹`);
    return true;
  }

  removeFavorite(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
      return;
    }
    const slot = this.slots[slotIndex];
    if (!slot) {
      return;
    }
    const folderName = slot.name;
    this.slots[slotIndex] = null;
    this.save();
    vscode.commands.executeCommand('setContext', `code-quick-refer.slot${slotIndex}.visible`, false);
    this.refreshProvider(slotIndex);
    vscode.window.showInformationMessage(`已从收藏夹移除 "${folderName}"`);
  }

  getSlot(index: number): FavoriteSlot | null {
    if (index < 0 || index >= SLOT_COUNT) {
      return null;
    }
    return this.slots[index];
  }

  findSlotIndexByViewId(viewId: string): number {
    const match = viewId.match(/favoriteSlot(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return -1;
  }
}

export class FavoriteSlotProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private changeEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private manager: FavoritesManager,
    private slotIndex: number,
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const slot = this.manager.getSlot(this.slotIndex);
    if (!slot) {
      const emptyItem = new vscode.TreeItem('未收藏', vscode.TreeItemCollapsibleState.None);
      emptyItem.iconPath = new vscode.ThemeIcon('circle-outline');
      emptyItem.tooltip = '右键文件夹选择"收藏到侧边活动栏"';
      return [emptyItem];
    }

    const item = new vscode.TreeItem(slot.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('folder');
    item.tooltip = slot.path;
    item.command = {
      command: 'code-quick-refer.revealFolder',
      title: '在资源管理器中显示',
      arguments: [slot.path],
    };
    return [item];
  }
}

function addFavoriteHandler(manager: FavoritesManager, uri: vscode.Uri): void {
  if (!uri) {
    vscode.window.showErrorMessage('未选择文件夹');
    return;
  }
  manager.addFavorite(uri);
}

function removeFavoriteHandler(manager: FavoritesManager, treeViews: vscode.TreeView<vscode.TreeItem>[]): void {
  // 找到当前可见的视图
  for (let i = 0; i < treeViews.length; i++) {
    if (treeViews[i].visible) {
      manager.removeFavorite(i);
      return;
    }
  }
}

export function createAddFavoriteCommand(manager: FavoritesManager): AddFavoriteHandler {
  return addFavoriteHandler.bind(null, manager);
}

export function createRemoveFavoriteCommand(
  manager: FavoritesManager,
  treeViews: vscode.TreeView<vscode.TreeItem>[],
): RemoveFavoriteHandler {
  return removeFavoriteHandler.bind(null, manager, treeViews);
}

export function revealFolderCommand(folderPath: string): void {
  const uri = vscode.Uri.file(folderPath);
  vscode.commands.executeCommand('revealInExplorer', uri);
}

function handleVisibilityChange(
  manager: FavoritesManager,
  slotIndex: number,
  e: vscode.TreeViewVisibilityChangeEvent,
): void {
  if (e.visible) {
    const slot = manager.getSlot(slotIndex);
    if (slot) {
      revealFolderCommand(slot.path);
    }
  }
}

function createVisibilityHandler(manager: FavoritesManager, slotIndex: number): VisibilityChangeHandler {
  return handleVisibilityChange.bind(null, manager, slotIndex);
}

export function initializeFavorites(context: vscode.ExtensionContext): vscode.Disposable[] {
  const manager = new FavoritesManager(context);
  const disposables: vscode.Disposable[] = [];
  const providers: FavoriteSlotProvider[] = [];
  const treeViews: vscode.TreeView<vscode.TreeItem>[] = [];

  // 注册每个插槽的 TreeDataProvider
  for (let i = 0; i < SLOT_COUNT; i++) {
    const provider = new FavoriteSlotProvider(manager, i);
    providers.push(provider);
    const treeView = vscode.window.createTreeView(`favoriteSlot${i}`, {
      treeDataProvider: provider,
    });
    treeViews.push(treeView);
    disposables.push(treeView);

    // 监听视图可见性变化，自动跳转到对应文件夹
    disposables.push(treeView.onDidChangeVisibility(createVisibilityHandler(manager, i)));
  }

  manager.setProviders(providers);

  // 注册命令
  disposables.push(vscode.commands.registerCommand('code-quick-refer.addFavorite', createAddFavoriteCommand(manager)));
  disposables.push(
    vscode.commands.registerCommand('code-quick-refer.removeFavorite', createRemoveFavoriteCommand(manager, treeViews)),
  );
  disposables.push(vscode.commands.registerCommand('code-quick-refer.revealFolder', revealFolderCommand));

  return disposables;
}
