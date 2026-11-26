'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const outputDirectory = path.resolve(__dirname, '..', 'out');
const files = fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();

if (files.length === 0) {
    console.error('No out/*.js files found to check.');
    process.exitCode = 1;
}

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(outputDirectory, file)], {
        stdio: 'inherit'
    });
    if (result.error) {
        console.error(`Could not check ${file}: ${result.error.message}`);
    }
    if (result.error || result.status !== 0) {
        process.exitCode = 1;
    }
}

// A small ZIP writer keeps private VSIX packaging independent of npm downloads.
// Payloads are small; ZIP64, streaming and archive updates are deliberately absent.
if (process.argv.includes('--package') && !process.exitCode) {
    packageExtension();
}

function packageExtension() {
    const { deflateRawSync } = require('node:zlib');
    const root = path.resolve(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const escape = value => String(value).replace(/[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
    const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escape(pkg.name)}" Version="${escape(pkg.version)}" Publisher="${escape(pkg.publisher)}" />
    <DisplayName>${escape(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${escape(pkg.description)}</Description>
    <Categories>Formatters,Other</Categories>
    <GalleryFlags>Private</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escape(pkg.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true" />
  </Assets>
</PackageManifest>`;
    const types = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>`;
    const entries = ['package.json', 'README.md', 'CHANGELOG.md', ...files.map(file => 'out/' + file)]
        .map(file => ({ name: 'extension/' + file, data: fs.readFileSync(path.join(root, file)) }));
    entries.push({ name: 'extension.vsixmanifest', data: Buffer.from(manifest) },
        { name: '[Content_Types].xml', data: Buffer.from(types) });
    const local = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const compressed = deflateRawSync(entry.data);
        let crc = 0xffffffff;
        for (const byte of entry.data) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        crc = (crc ^ 0xffffffff) >>> 0;
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x800, 6);
        header.writeUInt16LE(8, 8);
        header.writeUInt16LE(33, 12); // 1980-01-01, a valid deterministic DOS date.
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(entry.data.length, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, compressed);
        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50, 0);
        directory.writeUInt16LE(20, 4);
        header.copy(directory, 6, 4, 28);
        directory.writeUInt32LE(offset, 42);
        central.push(directory, name);
        offset += header.length + name.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const destination = path.join(dist, `${pkg.name}-${pkg.version}.vsix`);
    fs.writeFileSync(destination, Buffer.concat([...local, directory, end]));
    console.log('Built VSIX: ' + destination);
}