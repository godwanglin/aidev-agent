import type { FileTreeNode } from './file-explorer-types';

/**
 * Builds a hierarchical tree structure from a flat array of file paths.
 * Directories are sorted before files, and sorted alphabetically (case-insensitive).
 */
export function buildFileTree(
  filePaths: string[],
  changedPathsSet?: Set<string>
): FileTreeNode[] {
  const root: { [key: string]: any } = {};

  for (const rawPath of filePaths) {
    if (!rawPath) continue;
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/');
    let current = root;

    let accumulatedPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          __node: {
            id: accumulatedPath,
            name: part,
            path: accumulatedPath,
            type: isFile ? 'file' : 'directory',
            extension: isFile ? part.split('.').pop()?.toLowerCase() : undefined,
            isModified: changedPathsSet ? changedPathsSet.has(accumulatedPath) : false,
          } as FileTreeNode,
          __children: isFile ? undefined : {},
        };
      } else if (isFile) {
        current[part].__node.type = 'file';
        current[part].__node.isModified = changedPathsSet
          ? changedPathsSet.has(accumulatedPath)
          : false;
      }

      current = current[part].__children;
    }
  }

  function convertToNodes(obj: { [key: string]: any }): FileTreeNode[] {
    if (!obj) return [];
    const list: FileTreeNode[] = [];

    for (const key of Object.keys(obj)) {
      const item = obj[key];
      const node: FileTreeNode = { ...item.__node };
      if (item.__children) {
        node.children = convertToNodes(item.__children);
        // If any descendant is modified, mark folder as modified too
        if (node.children.some((c) => c.isModified)) {
          node.isModified = true;
        }
      }
      list.push(node);
    }

    return list.sort((a, b) => {
      // 1. Folders first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      // 2. Alphabetical (case-insensitive)
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  return convertToNodes(root);
}

/**
 * Filters the file tree based on a search query.
 * Retains parent directories if any child matches, and collects paths of folders to expand.
 */
export function filterFileTree(
  nodes: FileTreeNode[],
  searchQuery: string
): { filteredNodes: FileTreeNode[]; matchingFolderPaths: Set<string> } {
  const query = searchQuery.trim().toLowerCase();
  const matchingFolderPaths = new Set<string>();

  if (!query) {
    return { filteredNodes: nodes, matchingFolderPaths };
  }

  function filter(list: FileTreeNode[]): FileTreeNode[] {
    const results: FileTreeNode[] = [];

    for (const node of list) {
      const nameMatches = node.name.toLowerCase().includes(query);

      if (node.type === 'directory' && node.children) {
        const filteredChildren = filter(node.children);
        if (filteredChildren.length > 0 || nameMatches) {
          matchingFolderPaths.add(node.path);
          results.push({
            ...node,
            children: filteredChildren,
          });
        }
      } else if (nameMatches) {
        results.push(node);
      }
    }

    return results;
  }

  return {
    filteredNodes: filter(nodes),
    matchingFolderPaths,
  };
}

/**
 * Collects all directory paths in the tree (used for "Expand All").
 */
export function getAllFolderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  function traverse(list: FileTreeNode[]) {
    for (const item of list) {
      if (item.type === 'directory') {
        paths.push(item.path);
        if (item.children) {
          traverse(item.children);
        }
      }
    }
  }
  traverse(nodes);
  return paths;
}
