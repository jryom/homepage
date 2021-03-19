const { watch, series, src, pipe, parallel, dest } = require("gulp");
const htmlmin = require("gulp-htmlmin");
const purgecss = require("gulp-purgecss");

const styles = (cb) => {
  src("node_modules/tachyons/css/tachyons.min.css")
    .pipe(
      purgecss({
        content: ["index.html"],
      })
    )
    .pipe(dest("./dist"));
  cb();
};

const html = (cb) => {
  src("index.html")
    .pipe(htmlmin({ collapseWhitespace: true }))
    .pipe(dest("./dist"));
  cb();
};

exports.build = parallel(styles, html);
exports.watch = () => watch("*", parallel(styles, html));
