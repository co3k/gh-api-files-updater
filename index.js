#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const commander = require('commander');
const request = require('request');

commander
  .version('1.0.0')
  .usage('-k <key> -r <repository> -b <branch> <file ...>')
  .option('-k, --key <key>', 'GitHub API Key')
  .option('-b, --branch <branch>', 'Branch name')
  .option('-r, --repository <repository>', 'Target GitHub Repository ({user or org}/{repository name})')
  .parse(process.argv)
;

if (commander.args.length <= 0) {
  commander.help();
  process.exit(0);
}

if (!commander.key || !commander.repository || !commander.args) {
  console.error('The key option and the repository option, and the arguments are required.');
  commander.help();
  process.exit(1);
}

function call(method, url, params) {
  const options = ({
    method,
    url,
    baseUrl: 'https://api.github.com/',
    headers: {
      Authorization: `token ${commander.key}`,
      'Content-Type': 'application/json',
      'User-Agent': 'co3k/gh-api-fiels-updater',
    },
    json: true,
  });

  if (method === 'GET' && !!params) {
    options.qs = Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  } else {
    options.body = params || {};
  }

  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(body);
    });
  });
}

function extractTreeContentsFromRootTree(rootTree, key) {
  // 指定したキーのツリーの中身のみをツリーから抽出し、 Map から Array に変換して返す。サブディレクトリは除外する
}

function uploadFile(rootTree, file) {
  const filePath = path.relative(__dirname, file);
  const tree = new Map(rootTree.tree.map((t) => [t.path, t]));

  return call('POST', `/repos/${commander.repository}/git/blobs`, {
    content: fs.readFileSync(file, 'utf-8'),
  }).then((blob) => {
    console.log('ファイル: ', file);
    const treeNames = path.dirname(file).split(path.sep)
      .map((value, key, input) => {
        return input.slice(1, key + 1).join('/');
      })
      .reverse()
    ;

    const leafParentTreeId = !!treeNames[0] ? tree.get(treeNames[0]).sha : rootTree.sha;
    const leafParentTree = !!treeNames[0] ? tree.get(treeNames[0]) : rootTree;
    if (!leafParentTree) {
      console.error('TODO: implement to create new trees!!');
      console.error({ leafParentTreeId, treeNames });
      console.error(tree.get(treeNames[0]));
      return;
    }

    console.log('変更前のツリー', Array.from(leafParentTree.values()));

    treeNames.reduce((prev, next) => {
      return prev.then((obj) => {
        console.log('obj', obj);

        return new Promise((resolve) => {
          resolve({ ebi: 'zou' });
        });

//        return call('POST', 

      });
//        if (!currentTreeId) {  // leaf of trees
//          currentTreeId = prev
//        }

//        return call('POST', `/repos/${commander.repository}/git/trees`, {
//        });

//        console.log({ prev, next });
        /*
        const promise = (prev instanceof Promise) ? prev : new Promise();

        return promise.then(() => {
          return call('POST', `/repos/${commander.repository}/git/trees`, {
          });
        });
        */
//        return 'うおー';
      }, call('POST', `/repos/${commander.repository}/git/trees`, {
        base_tree: leafParentTreeId,
        tree: Array.from(leafParentTree.tree.set(filePath, {
          path: filePath,
          mode: 100644,
          type: 'blob',
          sha: blob.sha,
        }).values()).filter((entry) => !!entry.path.includes('/')),
      }))
    ;
  });
}

const rootDirectories = new Set(commander.args.map((v) => {
  return path.relative(__dirname, path.dirname(v)).split(path.sep)[0];
}).filter((v) => !!v));

let rootTree = {};
call('GET', `/repos/${commander.repository}/git/trees/${encodeURIComponent(commander.branch)}`).then((data) => {
  rootTree = data;

  const promises = [];
  const tree = new Map(data.tree.map((t) => [t.path, t]));
  rootDirectories.forEach((directory) => {
    const info = tree.get(directory);
    if (info) {
      promises.push(call('GET', `/repos/${commander.repository}/git/trees/${info.sha}?recursive=1`).then((directoryData) => {
        directoryData.tree.forEach((t) => {
          rootTree.tree.push(Object.assign({}, t, { path: `${directory}/${t.path}` }));
        });
      }));
    }
  });

  return Promise.all(promises);
}).then(() => {
  console.log(rootTree);

  return Promise.all(commander.args.map((file) => uploadFile(rootTree, file)));
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
