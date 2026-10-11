// Turns a guest's photo into a head cutout with accessory anchors.
// Everything runs on the device: the photo is never uploaded anywhere.
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0';
  const MODELS = '../../assets/juegos/ia/';
  const MAX_SIDE = 1024; // photos are scaled down to this before analysis
  const OUT_HEIGHT = 640;

  // Face mesh points used to place things (MediaPipe face landmark indices)
  const P = {
    forehead: 10, chin: 152, cheekA: 234, cheekB: 454,
    eyeA: 33, eyeB: 263, noseTip: 1, underNose: 164, mouthA: 61, mouthB: 291
  };

  let tools = null;

  // The library and both models load on first use (a few MB), then stay cached
  function load() {
    if (!tools) {
      tools = import(LIB + '/vision_bundle.mjs').then(async function (vision) {
        const files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm');
        const segmenter = await vision.ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS + 'selfie_segmenter.tflite' },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        });
        const landmarker = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS + 'face_landmarker.task' },
          runningMode: 'IMAGE',
          numFaces: 1
        });
        return { segmenter: segmenter, landmarker: landmarker };
      }).catch(function (error) {
        tools = null; // let the next attempt retry the download
        throw error;
      });
    }
    return tools;
  }

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  // Decodes the file upright (phone photos carry their rotation in EXIF) onto a canvas
  async function readPhoto(file) {
    let source;
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      source = await new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          resolve(img);
        };
        img.onerror = function () {
          reject(fail('bad-photo'));
        };
        img.src = URL.createObjectURL(file);
      });
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Person-vs-background confidence as a canvas whose alpha is the mask
  function personMask(result, noseX, noseY) {
    const masks = result.confidenceMasks;
    // Models differ in which mask is "person": take the one that is sure about the nose
    let best = null;
    let bestValue = -1;
    masks.forEach(function (mask) {
      const data = mask.getAsFloat32Array();
      const x = Math.min(mask.width - 1, Math.max(0, Math.round(noseX * mask.width)));
      const y = Math.min(mask.height - 1, Math.max(0, Math.round(noseY * mask.height)));
      const value = data[y * mask.width + x];
      if (value > bestValue) {
        bestValue = value;
        best = { data: data, width: mask.width, height: mask.height };
      }
    });
    const invert = bestValue < 0.5; // a single "background" mask

    const canvas = document.createElement('canvas');
    canvas.width = best.width;
    canvas.height = best.height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(best.width, best.height);
    for (let i = 0; i < best.data.length; i++) {
      const v = invert ? 1 - best.data[i] : best.data[i];
      // Soft edge between 0.3 and 0.7 confidence
      const t = Math.min(1, Math.max(0, (v - 0.3) / 0.4));
      image.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  async function cutOut(file) {
    const photo = await readPhoto(file);
    const loaded = await load();
    const W = photo.width;
    const H = photo.height;

    const faces = loaded.landmarker.detect(photo).faceLandmarks;
    if (!faces || !faces.length) throw fail('no-face');
    const pt = function (index) {
      return { x: faces[0][index].x * W, y: faces[0][index].y * H };
    };
    const dist = function (a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const forehead = pt(P.forehead);
    const chin = pt(P.chin);
    const eyeA = pt(P.eyeA);
    const eyeB = pt(P.eyeB);
    const leftEye = eyeA.x < eyeB.x ? eyeA : eyeB;
    const rightEye = eyeA.x < eyeB.x ? eyeB : eyeA;
    const faceW = dist(pt(P.cheekA), pt(P.cheekB));
    const faceH = dist(forehead, chin);
    const tilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    // "Up" along the head, so offsets follow a tilted face
    const up = { x: Math.sin(tilt), y: -Math.cos(tilt) };
    const centreX = (pt(P.cheekA).x + pt(P.cheekB).x) / 2;

    // Room for hair above and a little neck below
    const crop = {
      x: Math.max(0, centreX - faceW * 0.95),
      y: Math.max(0, forehead.y - faceH * 0.75),
      right: Math.min(W, centreX + faceW * 0.95),
      bottom: Math.min(H, chin.y + faceH * 0.3)
    };
    crop.w = crop.right - crop.x;
    crop.h = crop.bottom - crop.y;

    const nose = pt(P.noseTip);
    const segmentation = loaded.segmenter.segment(photo);
    const mask = personMask(segmentation, nose.x / W, nose.y / H);
    segmentation.close();

    const scale = OUT_HEIGHT / crop.h;
    const out = document.createElement('canvas');
    out.width = Math.round(crop.w * scale);
    out.height = OUT_HEIGHT;
    const ctx = out.getContext('2d');
    ctx.drawImage(photo, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    // Keep only the person
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mask,
      crop.x / W * mask.width, crop.y / H * mask.height, crop.w / W * mask.width, crop.h / H * mask.height,
      0, 0, out.width, out.height);
    // Fade out below the chin instead of a hard cut across the neck
    const fade = ctx.createLinearGradient(0, out.height * 0.84, 0, out.height);
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';

    // Anchors as fractions of the cutout, the same shape the built-in faces use
    const frac = function (p) {
      return { x: (p.x - crop.x) / crop.w, y: (p.y - crop.y) / crop.h };
    };
    const move = function (p, amount) {
      return { x: p.x + up.x * amount, y: p.y + up.y * amount };
    };
    return {
      label: 'Tú',
      src: out.toDataURL('image/png'),
      ratio: out.height / out.width,
      width: 0.62,
      tilt: tilt * 180 / Math.PI,
      head: frac(move(forehead, faceH * 0.1)),
      eyes: frac({ x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 }),
      nose: frac(nose),
      lip: frac(pt(P.underNose)),
      neck: frac(move(chin, -faceH * 0.2)),
      headW: faceW * 1.25 / crop.w,
      veilW: faceW * 1.9 / crop.w,
      eyesW: dist(leftEye, rightEye) * 1.72 / crop.w,
      lipW: dist(pt(P.mouthA), pt(P.mouthB)) * 1.3 / crop.w,
      noseW: faceW * 0.24 / crop.w,
      neckW: faceW * 0.62 / crop.w
    };
  }

  window.Selfie = { cutOut: cutOut };
})();
