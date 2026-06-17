import { debugLogger } from "./debug";
import type { Category, Prompt, TreeFolder, TreeNode, TreePrompt } from "./types";

/**
 * Build a tree structure from flat categories and prompts arrays.
 * Max folder depth is 1 (root folders can have child folders, but no deeper).
 */
export function buildTree(categories: Array<Category>, prompts: Array<Prompt>): Array<TreeNode> {
  debugLogger.debug("TreeUtils", "buildTree started", {
    categoriesCount: categories.length,
    promptsCount: prompts.length,
  });

  // Create maps for quick lookup
  const categoryMap = new Map<string, Category>();
  categories.forEach(cat => categoryMap.set(cat.id, cat));

  // Group categories by parent
  const childCategoriesByParent = new Map<string, Array<Category>>();
  const rootCategories: Array<Category> = [];

  categories.forEach(cat => {
    if (!cat.parent_category_id) {
      rootCategories.push(cat);
    } else {
      const children = childCategoriesByParent.get(cat.parent_category_id) || [];
      children.push(cat);
      childCategoriesByParent.set(cat.parent_category_id, children);
    }
  });

  debugLogger.debug("TreeUtils", "categories grouped", {
    rootCount: rootCategories.length,
    childGroupsCount: childCategoriesByParent.size,
  });

  // Group prompts by category
  const promptsByCategory = new Map<string, Array<Prompt>>();
  const rootPrompts: Array<Prompt> = [];

  prompts.forEach(prompt => {
    if (!prompt.category_id) {
      rootPrompts.push(prompt);
    } else {
      const existing = promptsByCategory.get(prompt.category_id) || [];
      existing.push(prompt);
      promptsByCategory.set(prompt.category_id, existing);
    }
  });

  debugLogger.debug("TreeUtils", "prompts grouped", {
    rootPromptsCount: rootPrompts.length,
    promptGroupsCount: promptsByCategory.size,
  });

  // Build tree recursively with max depth
  function buildFolderNode(category: Category, depth: number): TreeFolder {
    const children: Array<TreeNode> = [];

    // Only add child folders if we haven't reached max depth
    if (depth < 1) {
      const childCats = childCategoriesByParent.get(category.id) || [];
      childCats.forEach(childCat => {
        children.push(buildFolderNode(childCat, depth + 1));
      });
    }

    // Add prompts at any depth
    const categoryPrompts = promptsByCategory.get(category.id) || [];
    categoryPrompts.forEach(prompt => {
      children.push(buildPromptNode(prompt, depth + 1));
    });

    // Sort: folders first, then prompts, alphabetically within each group
    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      type: 'folder',
      id: category.id,
      name: category.name,
      depth,
      parentId: category.parent_category_id || null,
      category,
      children,
    };
  }

  function buildPromptNode(prompt: Prompt, depth: number): TreePrompt {
    return {
      type: 'prompt',
      id: prompt.id,
      name: prompt.name,
      depth,
      categoryId: prompt.category_id,
      prompt,
    };
  }

  const tree: Array<TreeNode> = [];

  // Add root folders
  rootCategories.forEach(cat => {
    tree.push(buildFolderNode(cat, 0));
  });

  // Add root prompts (prompts without a category)
  rootPrompts.forEach(prompt => {
    tree.push(buildPromptNode(prompt, 0));
  });

  // Sort root level
  tree.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  debugLogger.debug("TreeUtils", "buildTree completed", {
    treeNodeCount: tree.length,
    folderCount: tree.filter(n => n.type === 'folder').length,
    promptCount: tree.filter(n => n.type === 'prompt').length,
  });

  return tree;
}

/**
 * Filter tree nodes based on search query.
 * Returns nodes that match or have children that match.
 */
export function filterTree(nodes: Array<TreeNode>, query: string): Array<TreeNode> {
  if (!query.trim()) return nodes;

  const lowerQuery = query.toLowerCase();

  function nodeMatches(node: TreeNode): boolean {
    return node.name.toLowerCase().includes(lowerQuery);
  }

  function filterNodes(treeNodes: Array<TreeNode>): Array<TreeNode> {
    const result: Array<TreeNode> = [];

    for (const node of treeNodes) {
      if (node.type === 'folder') {
        const filteredChildren = filterNodes(node.children);
        if (nodeMatches(node) || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      } else {
        if (nodeMatches(node)) {
          result.push(node);
        }
      }
    }

    return result;
  }

  return filterNodes(nodes);
}

/**
 * Get all folder IDs that should be expanded to show search results.
 */
export function getExpandedIdsForSearch(nodes: Array<TreeNode>, query: string): Set<string> {
  const expanded = new Set<string>();
  if (!query.trim()) return expanded;

  const lowerQuery = query.toLowerCase();

  function traverse(treeNodes: Array<TreeNode>, parentIds: Array<string>): boolean {
    let hasMatch = false;

    for (const node of treeNodes) {
      if (node.type === 'folder') {
        const childMatch = traverse(node.children, [...parentIds, node.id]);
        const selfMatch = node.name.toLowerCase().includes(lowerQuery);
        
        if (childMatch || selfMatch) {
          hasMatch = true;
          // Expand all parents
          parentIds.forEach(id => expanded.add(id));
          if (childMatch) {
            expanded.add(node.id);
          }
        }
      } else {
        if (node.name.toLowerCase().includes(lowerQuery)) {
          hasMatch = true;
          parentIds.forEach(id => expanded.add(id));
        }
      }
    }

    return hasMatch;
  }

  traverse(nodes, []);
  return expanded;
}
