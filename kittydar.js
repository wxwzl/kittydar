var brain = require("brain"),
    hog = require("hog-descriptor"),
    nms = require("./nms");

if (process.arch) {   // in node
  var Canvas = (require)('canvas');
}

var network = require("./network.json");
var net = new brain.NeuralNetwork().fromJSON(network);

var params = {
  patchSize: 48,       // size of training images in px
  minSize: 48,         // starting window size
  resize: 360,         // initial image resize size in px
  scaleStep: 6,        // scaling step size in px
  shiftBy: 4,          // px to slide window by
  overlapThresh: 0.5,  // min overlap ratio to classify as an overlap
  minOverlaps: 8,      // minumum overlapping rects to classify as a head
  HOGparams: {         // parameters for HOG descriptor
    cellSize: 4, // must divide evenly into shiftBy
    blockSize: 2,
    blockStride: 1,
    bins: 6,
    norm: "L2"
  },
  extractFeatures: function(imagedata, histograms) {
    // override if using another set of features
    var descriptor = hog.extractHOGFromHistograms(histograms, params.HOGparams);
    return descriptor;
  },
  classify: function(features) {
    // override if using another classifier
    var output = net.runInput(features)[0];
    return {
      isCat: output > 0.995,
      value: output
    };
  }
}

var kittydar = {
  detectCats: function(canvas, options) {
    if (options) {
      for (var opt in options) {
        params[opt] = options[opt];
      }
    }

    // get canvases of the image at different scales
    var resizes = this.getAllSizes(canvas, params.minSize);

    var cats = [];
    resizes.forEach(function(resize) {
      var kitties = kittydar.detectAtScale(resize.imagedata, resize.scale);
      cats = cats.concat(kitties);
    });
    cats = nms.combineOverlaps(cats, params.overlapThresh, params.minOverlaps);

    return cats;
  },

  getAllSizes: function(canvas, minSize) {
    // For use with Worker threads, return canvas ImageDatas
    // resized to accomodate various window sizes

    minSize = minSize || params.minSize;

    // resize canvas to cut down on number of windows to check
    var max = Math.max(canvas.width, canvas.height)
    var scale = Math.min(max, params.resize) / max;

    var resizes = [];
    for (var size = minSize; size < max; size += params.scaleStep) {
      var winScale = (minSize / size) * scale;
      var imagedata = this.scaleCanvas(canvas, winScale);

      resizes.push({
        imagedata: imagedata,
        scale: winScale,
        size: size
      })
    }
    return resizes;
  },

  scaleCanvas: function(canvas, scale) {
    var width = Math.floor(canvas.width * scale);
    var height = Math.floor(canvas.height * scale);

    canvas = resizeCanvas(canvas, width, height);
    var ctx = canvas.getContext("2d");
    var imagedata = ctx.getImageData(0, 0, width, height);

    return imagedata;
  },

  detectAtScale: function(imagedata, scale) {
    // Detect using a sliding window of a fixed size.
    var histograms = hog.extractHistograms(imagedata, params.HOGparams);
    var cats = [];

    var width = imagedata.width,
        height = imagedata.height;

    var size = params.patchSize;
    var shift = params.shiftBy;

    for (var y = 0; y + size < height; y += shift) {
      for (var x = 0; x + size < width; x += shift) {
        var histRect = getRect(histograms, x / shift, y / shift, size / shift, size / shift);
        var features = params.extractFeatures(imagedata, histRect);
        var result = params.classify(features);

        if (result.isCat) {
          cats.push({
            x: Math.floor(x / scale),
            y: Math.floor(y / scale),
            width: Math.floor(size / scale),
            height: Math.floor(size / scale),
            value: result.value
          });
        }
      }
    }
    return cats;
  }
}

function getRect(matrix, x, y, width, height) {
  var square = new Array(height);
  for (var i = 0; i < height; i++) {
    square[i] = new Array(width);
    for (var j = 0; j < width; j++) {
      square[i][j] = matrix[y + i][x + j];
    }
  }
  return square;
}

function resizeCanvas(canvas, width, height) {
  var resizeCanvas = createCanvas(width, height);
  var ctx = resizeCanvas.getContext('2d');
  ctx.patternQuality = "best";

  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height,
                0, 0, width, height);
  return resizeCanvas;
}

function createCanvas (width, height) {
  if (typeof Canvas !== 'undefined') {
    // have node-canvas
    return new Canvas(width, height);
  }
  else {
    // in browser
    var canvas = document.createElement('canvas');
    canvas.setAttribute('width', width);
    canvas.setAttribute('height', height);
    return canvas;
  }
}


module.exports = kittydar;
