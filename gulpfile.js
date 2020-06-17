const gulp = require("gulp");
const purgecss = require("gulp-purgecss");
const rename = require("gulp-rename");

gulp.task("watch", () => gulp.watch("**/index.html", gulp.series("styles")));

gulp.task("styles", () =>
  gulp
    .src("node_modules/tachyons/css/tachyons.min.css")
    .pipe(rename("styles.css"))
    .pipe(
      purgecss({
        content: ["index.html"],
      })
    )
    .pipe(gulp.dest("."))
);
