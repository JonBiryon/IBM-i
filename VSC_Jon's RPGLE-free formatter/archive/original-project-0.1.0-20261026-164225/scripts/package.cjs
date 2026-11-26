'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const flag = process.argv.indexOf('--vscode-executable');
const yazl = flag >= 0
  ? require(path.join(path.dirname(process.argv[flag + 1]), 'resources', 'app', 'node_modules', 'yazl'))
  : require('yazl');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const xml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[char]);
if (!fs.existsSync(path.join(root, 'out', 'extension.js'))) { throw new Error('Compile before packaging.'); }
const directory = path.join(root, 'dist');
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, `${manifest.name}-${manifest.version}.vsix`);
const zip = new yazl.ZipFile();
const stream = fs.createWriteStream(output);
zip.on('error', error => { console.error(error); process.exitCode = 1; stream.destroy(error); });
stream.on('error', error => { console.error(error); process.exitCode = 1; });
stream.on('close', () => { if (!process.exitCode) { console.log(`Packaged ${output}`); } });
zip.outputStream.pipe(stream);
zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(manifest.name)}" Version="${xml(manifest.version)}" Publisher="${xml(manifest.publisher)}" />
    <DisplayName>${xml(manifest.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(manifest.description)}</Description>
    <Categories>${xml(manifest.categories.join(','))}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(manifest.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true" />
  </Assets>
</PackageManifest>`), 'extension.vsixmanifest');
zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>`), '[Content_Types].xml');
for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) {
  zip.addFile(path.join(root, file), `extension/${file}`);
}
for (const file of fs.readdirSync(path.join(root, 'out')).filter(name => name.endsWith('.js'))) {
  zip.addFile(path.join(root, 'out', file), `extension/out/${file}`);
}
zip.end();