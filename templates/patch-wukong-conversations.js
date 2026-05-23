#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const libraryPath = path.join(root, 'library.js');
const pluginPath = path.join(root, 'plugin.json');

if (!fs.existsSync(libraryPath)) {
  console.error('library.js not found. Run this from nodebb-plugin-wukong-chat repo root.');
  process.exit(1);
}

let library = fs.readFileSync(libraryPath, 'utf8');

if (!library.includes("renderWukongConversationsPage")) {
  const marker = "router.get('/wukong', middleware.ensureLoggedIn, asyncHandler(renderWukongPage)); router.get('/wukong/:uid', middleware.ensureLoggedIn, asyncHandler(renderWukongPage));";
  const replacement =
    "async function renderWukongConversationsPage(req, res) { res.render('wukong-conversations', { title: '悟空会话' }); } " +
    "router.get('/wukong/conversations', middleware.ensureLoggedIn, asyncHandler(renderWukongConversationsPage)); " +
    "router.get('/wukong/conversation', middleware.ensureLoggedIn, asyncHandler(renderWukongConversationsPage)); " +
    marker;

  if (!library.includes(marker)) {
    console.error('Could not find wukong page route marker in library.js');
    process.exit(1);
  }

  library = library.replace(marker, replacement);
}

library = library.replace(
  "route: '/wukong', title: '悟空聊天', iconClass: 'fa-comments', text: '悟空聊天',",
  "route: '/wukong/conversations', title: '悟空会话', iconClass: 'fa-comments', text: '悟空会话',"
);

fs.writeFileSync(libraryPath, library, 'utf8');

if (fs.existsSync(pluginPath)) {
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  plugin.templates = plugin.templates || 'templates';
  plugin.staticDirs = plugin.staticDirs || {};
  plugin.staticDirs.static = plugin.staticDirs.static || 'public';
  fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2), 'utf8');
}

console.log('Patched Wukong independent conversation list routes successfully.');
console.log('Routes: /wukong/conversations and /wukong/conversation');

