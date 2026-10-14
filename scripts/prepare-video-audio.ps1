$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$assetRoot = Join-Path $projectRoot 'video/public'
$scenes = Get-Content -LiteralPath (Join-Path $assetRoot 'scenes.json') -Raw | ConvertFrom-Json
$voice = New-Object -ComObject SAPI.SpVoice
$voice.Rate = 1
for ($sceneIndex = 0; $sceneIndex -lt $scenes.Count; $sceneIndex++) {
  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Open((Join-Path $assetRoot "voice-$sceneIndex.wav"), 3, $false)
  $voice.AudioOutputStream = $stream
  $null = $voice.Speak($scenes[$sceneIndex].narration)
  $stream.Close()
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2') -Destination (Join-Path $assetRoot 'grotesk.woff2')
Copy-Item -LiteralPath (Join-Path $projectRoot 'node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2') -Destination (Join-Path $assetRoot 'poppins.woff2')
Write-Output 'Eight local narration files and brand fonts prepared. No paid API used.'
