<#
.SYNOPSIS
  Converts the delivered JPEG artwork into the lossless PNG master the
  icon pipeline consumes.

.DESCRIPTION
  assets/icon.jpeg is what came out of WhatsApp: a progressive,
  chroma-subsampled JPEG. scripts/generate-icons.mjs deliberately reads
  only PNG - decoding progressive JPEG by hand would add hundreds of
  lines of risk for zero quality gain, since the decode itself is what
  Windows Imaging Component already does correctly.

  So the lossy original is decoded once, here, into a lossless 24-bit
  PNG master that is committed alongside it. Every icon is then derived
  from that master by the cross-platform Node pipeline, which needs no
  Windows, no PowerShell and no dependencies.

  Run this only when the source artwork changes. Windows only.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/jpeg-to-png.ps1
  npm run icons
#>
[CmdletBinding()]
param(
  [string]$Source,
  [string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Defaults live here rather than in the param block: PowerShell 5.1
# evaluates parameter defaults before $PSScriptRoot is bound.
$assets = Join-Path $PSScriptRoot '..\assets'
if (-not $Source) { $Source = Join-Path $assets 'icon.jpeg' }
if (-not $Destination) { $Destination = Join-Path $assets 'icon-source.png' }

$Source = (Resolve-Path -LiteralPath $Source).Path
$image = [System.Drawing.Image]::FromFile($Source)
try {
  Write-Host ("source: {0}x{1} {2}" -f $image.Width, $image.Height, $image.PixelFormat)
  $image.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $image.Dispose()
}

$written = Get-Item -LiteralPath $Destination
Write-Host ("wrote {0} ({1:N1} kB)" -f $written.FullName, ($written.Length / 1KB))
