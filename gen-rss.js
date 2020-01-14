const Rss = require('./lib/es6/src/GenRss.bs.js');

const mdx = require('@mdx-js/mdx');
const babel = require("@babel/core");
const fs = require('fs');
const path = require('path');

function requireFromStringSync(src, filename) {
  const Module = module.constructor;
  const m = new Module();
  m._compile(src, filename);
  return m.exports;
}

function requireMDXSync(mdxSrc, filename) {
  let ast = null;
  const jsx = mdx.sync(
      mdxSrc,
      {remarkPlugins : [function(){return function(tree){ast = tree}}]});
  const babelOptions = babel.loadOptions({
    babelrc : false,
    presets : [
      '@babel/preset-react',
    ],
    plugins : [
      "@babel/plugin-transform-modules-commonjs",
      [
        "module-resolver", {
          "alias" : {
            "@reason" : path.join(__dirname, 'lib', 'es6', 'src'),
          },
        }
      ]
    ]
  });
  const transformed = babel.transformSync(jsx, babelOptions);
  return [ requireFromStringSync(transformed.code, filename), ast ];
}

function requireMDXFileSync(path) {
  const mdxSrc = fs.readFileSync(path, {encoding : 'utf-8'});
  return requireMDXSync(mdxSrc, path);
}

function scanDir(dirPath, extension) {
  const mdxFiles = [];
  function scan(dirPath) {
    const filenames = fs.readdirSync(dirPath);
    filenames.sort();
    filenames.map(function(filename) {
      const filePath = path.join(dirPath, filename);
      const st = fs.statSync(filePath);
      if (st.isFile() && filePath.endsWith(extension)) {
        mdxFiles.push(filePath);
      }
      if (st.isDirectory()) {
        scan(filePath);
      }
    });
  };
  scan(dirPath);
  return mdxFiles;
}

function readPostMetadata(postPath) {
  const[mod, ast] = requireMDXFileSync(postPath);
  const {meta} = mod;
  const title = (meta && meta.title)
                    ? meta.title
                    : (ast.children
                           .filter(function(x){return x.type == 'heading' &&
                                                      x.depth == 1})[0]
                           .children[0]
                           .value);

  // pull description
  const description =
      (meta && meta.description)
          ? meta.description
          : (ast.children.filter(function(x){return x.type == 'paragraph'})[0]
                 .children[0]
                 .value);

  return {
    filePath: postPath,
    urlPath: postPath.replace(/\\/, '/').replace(/^pages/, '').replace(/\.mdx?$/, ''),
    title,
    date: (meta && new Date(meta.date)) || new Date(),
    description
  };
}

function main() {
  const postPaths = scanDir('pages/posts', '.mdx');
  console.debug({postPaths});
  const now = new Date();
  const posts = postPaths.map(readPostMetadata)
                    .filter(function(post){return post.date <= now});
  posts.sort(function(a, b){return b.date - a.date});
  console.debug({posts});
  const postsJSON = JSON.stringify(posts, null, 2);
  const exportPath = 'pages/posts/index.gen.js';
  fs.writeFileSync(exportPath,
                   '// automatically generated by build_post_index.js\n' +
    `export default ` + postsJSON + ';\n');
  console.info(`Saved ${posts.length} posts in ` + exportPath);
  const rssPath = 'public/static/blog-rss.xml';
  const rssXML = Rss.draw(posts);
  fs.writeFileSync(rssPath, rssXML);
  console.info(`Saved RSS feed to ` + rssPath);
}

main();
