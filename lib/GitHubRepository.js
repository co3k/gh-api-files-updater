'use strict';

module.exports = class GitHubRepository {
  constructor(treeObject) {
    this.treeObject = treeObject;
    this.treeContents = this.convertTreeArrayToMap(treeObject.tree);
  }

  getObject(path) {
    return this.treeContents.get(path);
  }

  setObject(path, object) {
    this.treeContents.set(path, object);
  }

  fillTreeContents(path, data) {
    this.convertTreeArrayToMap(data.tree.map((t) => Object.assign(t, { path: `${path}/${t.path}` }))).forEach((value, key) => {
      this.treeContents.set(key, value);
    });
  }

  extractTreeContentsToArray(path) {
    if (!this.treeContents.has(path)) {
      return [];
    }

    return Array.from(this.treeContents.values()).filter((obj) => {
      if (!obj.path.startsWith(path)) {
        return false;
      }

      const suffix = obj.path.substr(path.length + 1);
      if (!suffix) {
        return false;
      }

      if (suffix.includes('/')) {
        return false;
      }

      return true;
    }).map((obj) => {
      return Object.assign(obj, {
        path: obj.path.substr(path.length + 1),
      });
    });
  }

  convertTreeArrayToMap(treeArray) {
    return new Map(treeArray.map((t) => [t.path, t]));
  }
};
