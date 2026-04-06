module.exports = function(config) {
  config.addPassthroughCopy("static");
  config.addPassthroughCopy("favicon.svg");
  config.addPassthroughCopy("netlify");

  return {
    dir: {
      input: ".",
      includes: "_includes",
      layouts: "_includes/layouts",
      data: "_data",
      output: "_site"
    }
  };
};
