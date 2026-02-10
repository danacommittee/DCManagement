const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const iconsDir = path.join(publicDir, "icons");
const logoPath = path.join(publicDir, "logo.png");

const sizes = [192, 512];

async function main() {
  if (!fs.existsSync(logoPath)) {
    console.error("public/logo.png not found");
    process.exit(1);
  }
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  for (const size of sizes) {
    const outPath = path.join(iconsDir, `icon-${size}.png`);
    await sharp(logoPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log("Created", outPath);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
