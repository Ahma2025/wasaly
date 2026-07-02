const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ORANGE = { r: 255, g: 107, b: 0 };

// Fix black JPEG corners by replacing near-black pixels with orange
async function fixAndResize(srcPath, width, height, fit = 'cover') {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] < 40 && data[i+1] < 40 && data[i+2] < 40) {
      data[i] = 255; data[i+1] = 107; data[i+2] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .resize(width, height, { fit, background: { r: 255, g: 107, b: 0, alpha: 1 } })
    .flatten({ background: { r: 255, g: 107, b: 0 } })
    .png();
}

// Create splash: orange background + centered logo
async function makeSplash(srcPath, size) {
  const LOGO = Math.floor(size * 0.45);
  const logoBuf = await (await fixAndResize(srcPath, LOGO, LOGO, 'contain')).toBuffer();
  const offset = Math.floor((size - LOGO) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4,
      background: { r: ORANGE.r, g: ORANGE.g, b: ORANGE.b, alpha: 1 } }
  }).composite([{ input: logoBuffer = logoBuf, top: offset, left: offset }]);
}

async function makeSplashBuf(srcPath, size) {
  const LOGO = Math.floor(size * 0.45);
  const logoBuf = await (await fixAndResize(srcPath, LOGO, LOGO, 'contain')).toBuffer();
  const offset = Math.floor((size - LOGO) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4,
      background: { r: ORANGE.r, g: ORANGE.g, b: ORANGE.b, alpha: 1 } }
  }).composite([{ input: logoBuf, top: offset, left: offset }]).png().toBuffer();
}

function write(buf, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('  ✅', path.relative(process.cwd(), dest));
}

async function processRN(appDir, srcPath) {
  const res = path.join(appDir, 'android/app/src/main/res');
  const mipmaps = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
  };

  // Icons → mipmap folders
  for (const [folder, size] of Object.entries(mipmaps)) {
    const buf = await (await fixAndResize(srcPath, size, size, 'cover')).toBuffer();
    write(buf, path.join(res, folder, 'ic_launcher.png'));
    write(buf, path.join(res, folder, 'ic_launcher_round.png'));
  }

  // Splash image → drawable (1024×1024 centered on orange)
  const splashBuf = await makeSplashBuf(srcPath, 1024);
  write(splashBuf, path.join(res, 'drawable', 'splashscreen_image.png'));

  // Also update assets/ for app.json reference
  const icon1024 = await (await fixAndResize(srcPath, 1024, 1024, 'cover')).toBuffer();
  write(icon1024, path.join(appDir, 'assets/icon.png'));
  write(icon1024, path.join(appDir, 'assets/adaptive-icon.png'));
  write(splashBuf, path.join(appDir, 'assets/splash.png'));
}

async function processCapacitor(appDir, srcPath) {
  const resDir = path.join(appDir, 'android/app/src/main/res');
  const mipmaps = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
  };

  for (const [folder, size] of Object.entries(mipmaps)) {
    const buf = await (await fixAndResize(srcPath, size, size, 'cover')).toBuffer();
    write(buf, path.join(resDir, folder, 'ic_launcher.png'));
    write(buf, path.join(resDir, folder, 'ic_launcher_foreground.png'));
    write(buf, path.join(resDir, folder, 'ic_launcher_round.png'));
  }

  // Splash
  const splashBuf = await makeSplashBuf(srcPath, 1024);
  write(splashBuf, path.join(resDir, 'drawable', 'splash.png'));

  // resources folder
  const icon1024 = await (await fixAndResize(srcPath, 1024, 1024, 'cover')).toBuffer();
  write(icon1024, path.join(appDir, 'resources/icon.png'));
  write(splashBuf, path.join(appDir, 'resources/splash.png'));
}

async function main() {
  console.log('🚀 Generating icons & splash for all apps...\n');

  console.log('\n📱 Customer App (زبون):');
  await processRN('D:/wasaly/customer-app', 'D:/wasaly/zbon.jpeg');

  console.log('\n🚗 Driver App (سائق):');
  await processRN('D:/wasaly/driver-app', 'D:/wasaly/shofer.jpeg');

  console.log('\n🍽️ Restaurant Portal (مطعم):');
  await processCapacitor('D:/wasaly/restaurant-portal', 'D:/wasaly/mat3m.jpeg');

  console.log('\n✅ Dashboard logo:');
  const adminBuf = await (await fixAndResize('D:/wasaly/idara.jpeg', 512, 512, 'cover')).toBuffer();
  write(adminBuf, 'D:/wasaly/admin-dashboard/public/logo.png');

  console.log('\n🎉 All done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
