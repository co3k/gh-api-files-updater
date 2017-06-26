#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const commander = require('commander');
const request = require('request');

const GitHubRepository = require('./lib/GitHubRepository');

commander
  .version('1.0.0')
  .usage('-k <key> -r <repository> -b <branch> -m <message> <file ...>')
  .option('-k, --key <key>', 'GitHub API Key')
  .option('-b, --branch <branch>', 'Branch name')
  .option('-r, --repository <repository>', 'Target GitHub Repository ({user or org}/{repository name})')
  .option('-m, --message <message>', 'Commit message')
  .parse(process.argv)
;

if (commander.args.length <= 0) {
  commander.help();
  process.exit(0);
} 
if (!commander.key || !commander.repository || !commander.args || !commander.message) {
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
      'User-Agent': 'co3k/gh-api-files-updater',
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

      if (response.statusCode >= 200 && response.statusCode < 400) {
        resolve(body);
        return;
      }

      reject(new Error(`This request is failed with status code ${response.statusCode}. message: ${body}`));
    });
  });
}

function uploadFile(repository, file) {
  const filePath = path.relative(__dirname, file);

  return call('POST', `/repos/${commander.repository}/git/blobs`, {
    content: fs.readFileSync(file, 'utf-8'),
  }).then((blob) => {
    const treeNames = path.dirname(file).split(path.sep)
      .map((value, key, input) => {
        return input.slice(0, key + 1).join('/');
      })
      .filter((v) => '.' !== v)
      .reverse()
    ;

    const modifiedTree = repository.extractTreeContentsToArray(treeNames[0]);
    modifiedTree.push({
      path: path.basename(filePath),
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });

    const appendFile = new Promise((resolve) => {
      const newDirectories = [];
      treeNames.reverse().forEach((dir) => {
        const object = repository.getObject(dir);
        if (!object) {
          newDirectories.push(dir);
        }
      });

      newDirectories.reduce((prev, next) => {
        console.log('ぷれぶ', prev);
        return prev.then((object) => {
          console.log('オブジェクトとネクスト', object, next);

          console.log('POST', `/repos/${commander.repository}/git/trees`, {
            base_tree: object.sha,
            tree: [],
          });

          return call('POST', `/repos/${commander.repository}/git/trees`, {
            base_tree: object.sha,
            tree: [],
          }).then((object) => {
            console.log('オブジェクトをセット', object);
            repository.setObject(next, object);

            return new Promise((resolve) => { resolve(object); });
          });
        });
      }, new Promise((resolve) => { resolve(repository.treeObject); }));

      const leafParentTreeObject = !!treeNames[0] ? repository.getObject(treeNames[0]) : repository.treeObject;

      return call('POST', `/repos/${commander.repository}/git/trees`, {
        base_tree: leafParentTreeObject.sha,
        tree: modifiedTree,
      });
    });

    return treeNames.reduce((prev, next) => {
      console.log(next);

      return prev.then((obj) => {
        console.log('prev result', obj);

        return call('POST', `/repos/${commander.repository}/git/trees`, {
          base_tree: repository.getObject(next).sha,
          tree: obj.tree,
        });
      });
    }, appendFile).then((root) => {
      return call('POST', `/repos/${commander.repository}/git/trees`, {
        base_tree: repository.treeObject.sha,
        tree: root.tree,
      });
    }).then((rootTree) => {
      repository.treeObject = rootTree;

      return rootTree;
    });
  });
}

const rootDirectories = new Set(commander.args.map((v) => {
  return path.relative(__dirname, path.dirname(v)).split(path.sep)[0];
}).filter((v) => !!v));

let commitId;
let repository;
call('GET', `/repos/${commander.repository}/branches/${encodeURIComponent(commander.branch)}`).then((branch) => {
  commitId = branch.commit.sha;

  return call('GET', `/repos/${commander.repository}/git/trees/${commitId}`);
}).then((data) => {
  repository = new GitHubRepository(data);

  const promises = [];
  rootDirectories.forEach((directory) => {
    const object = repository.getObject(directory);
    if (!object) {
      return;
    }

    promises.push(call('GET', `/repos/${commander.repository}/git/trees/${object.sha}?recursive=1`).then((directoryData) => {
      repository.fillTreeContents(directory, directoryData);
    }));
  });

  return Promise.all(promises);
}).then(() => {
  return commander.args.reduce((prev, next) => {
    return prev.then(() => uploadFile(repository, next));
  }, new Promise((resolve) => { resolve(); }));
}).then(() => {
  return call('POST', `/repos/${commander.repository}/git/commits`, {
    message: commander.message,
    tree: repository.treeObject.sha,
    parents: [commitId],
  });
}).then((commit) => {
  return call('POST', `/repos/${commander.repository}/git/refs/heads/${commander.branch}`, {
    force: false,
    sha: commit.sha,
  });
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
