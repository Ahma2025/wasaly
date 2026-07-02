const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function fixBlack(srcPath) {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] < 40 && data[i+1] < 40 && data[i+2] < 40) {
      data[i] = 255; data[i+1] = 107; data[i+2] = 0;
    }
  }
  return { data, info };
}

// For adaptive icon foreground: center logo on transparent bg, sized for safe zone
async function makeForeground(srcPath, totalSize) {
  // Safe zone = 66% of total. Put logo at 60% to be safe
  const logoSize = Math.floor(totalSize * 0.60);
  const { data, info } = await fixBlack(srcPath);

  const logoBuf = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 107, b: 0, alpha: 1 } })
    .flatten({ background: { r: 255, g: 107, b: 0 } })
    .png()
    .toBuffer();

  const offset = Math.floor((totalSize - logoSize) / 2);

  return sharp({
    create: { width: totalSize, height: totalSize, channels: 4,
      background: { r: 255, g: 107, b: 0, alpha: 1 } }
  })
    .composite([{ input: logoBuf, top: offset, left: offset }])
    .flatten({ background: { r: 255, g: 107, b: 0 } })
    .png()
    .toBuffer();
}

async function makeLauncher(srcPath, size) {
  const { data, info } = await fixBlack(srcPath);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
}

function write(buf, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('  ✅', path.relative('D:/wasaly', dest));
}

const mipmaps = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
};

async function fixApp(label, resDir, srcPath) {
  console.log(`\n${label}:`);
  for (const [folder, size] of Object.entries(mipmaps)) {
    const launcher = await makeLauncher(srcPath, size);
    const foreground = await makeForeground(srcPath, size);
    write(launcher, path.join(resDir, folder, 'ic_launcher.png'));
    write(launcher, path.join(resDir, folder, 'ic_launcher_round.png'));
    write(foreground, path.join(resDir, folder, 'ic_launcher_foreground.png'));
  }
}

async function main() {
  const base = 'D:/wasaly';

  await fixApp('🚗 Driver App',
    path.join(base, 'driver-app/android/app/src/main/res'),
    path.join(base, 'shofer.jpeg')
  );

  await fixApp('🍽️ Restaurant Portal',
    path.join(base, 'restaurant-portal/android/app/src/main/res'),
    path.join(base, 'mat3m.jpeg')
  );

  await fixApp('📱 Customer App',
    path.join(base, 'customer-app/android/app/src/main/res'),
    path.join(base, 'zbon.jpeg')
  );

  await fixApp('⚙️ Admin Dashboard',
    path.join(base, 'admin-dashboard/android/app/src/main/res'),
    path.join(base, 'idara.jpeg')
  );

  console.log('\n🎉 Done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
