var gulp = require('gulp');
var mocha = require('gulp-mocha');
var util = require('gulp-util');
var notify = require("gulp-notify");

gulp.task('test', function () {
    return gulp.src(['test/**/*.js'], { read: false })
        .pipe(mocha({ reporter: 'spec' }))
        .on('error', function(err){
          console.log("Tests failed!: "+err);
          notify("Tests failed!: "+err);
          this.emit('end');
        });
});

gulp.task('watch-test', function () {
    gulp.watch(['views/**', 'public/**', 'index.js', 'test/**'], ['test']);
});
