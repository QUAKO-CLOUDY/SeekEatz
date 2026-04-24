param(
  [Parameter(Mandatory = $true)]
  [string]$LogoPath,

  [int]$CanvasSize = 512,

  [double]$PaddingRatio = 0.14,

  [int]$Tolerance = 36
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Test-SimilarColor {
  param(
    [System.Drawing.Color]$A,
    [System.Drawing.Color]$B,
    [int]$Threshold
  )

  return (
    [Math]::Abs($A.R - $B.R) -le $Threshold -and
    [Math]::Abs($A.G - $B.G) -le $Threshold -and
    [Math]::Abs($A.B - $B.B) -le $Threshold -and
    [Math]::Abs($A.A - $B.A) -le $Threshold
  )
}

$resolvedPath = (Resolve-Path $LogoPath).Path
$repoRoot = (Resolve-Path ".").Path
$backupRoot = Join-Path $repoRoot "_backups\logo-normalization"
$backupFolder = Join-Path $backupRoot (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null

$fileName = [System.IO.Path]::GetFileName($resolvedPath)
$backupPath = Join-Path $backupFolder $fileName
Copy-Item -LiteralPath $resolvedPath -Destination $backupPath -Force

$imageBytes = [System.IO.File]::ReadAllBytes($resolvedPath)
$memoryStream = New-Object System.IO.MemoryStream(,$imageBytes)
$sourceImage = [System.Drawing.Image]::FromStream($memoryStream)
$bitmap = New-Object System.Drawing.Bitmap($sourceImage)
try {
  $width = $bitmap.Width
  $height = $bitmap.Height
  if ($width -le 0 -or $height -le 0) {
    throw "Invalid image dimensions for '$resolvedPath'."
  }

  $background = $bitmap.GetPixel(0, 0)

  $visited = New-Object 'bool[,]' $width, $height
  $backgroundMask = New-Object 'bool[,]' $width, $height
  $queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()

  $queue.Enqueue([System.Drawing.Point]::new(0, 0))
  $queue.Enqueue([System.Drawing.Point]::new($width - 1, 0))
  $queue.Enqueue([System.Drawing.Point]::new(0, $height - 1))
  $queue.Enqueue([System.Drawing.Point]::new($width - 1, $height - 1))

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    $x = $point.X
    $y = $point.Y

    if ($x -lt 0 -or $x -ge $width -or $y -lt 0 -or $y -ge $height) {
      continue
    }

    if ($visited[$x, $y]) {
      continue
    }

    $visited[$x, $y] = $true
    $pixel = $bitmap.GetPixel($x, $y)

    if ($pixel.A -lt 200) {
      continue
    }

    if (-not (Test-SimilarColor -A $pixel -B $background -Threshold $Tolerance)) {
      continue
    }

    $backgroundMask[$x, $y] = $true

    $queue.Enqueue([System.Drawing.Point]::new($x + 1, $y))
    $queue.Enqueue([System.Drawing.Point]::new($x - 1, $y))
    $queue.Enqueue([System.Drawing.Point]::new($x, $y + 1))
    $queue.Enqueue([System.Drawing.Point]::new($x, $y - 1))
  }

  $cleaned = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        $pixel = $bitmap.GetPixel($x, $y)
        if ($backgroundMask[$x, $y]) {
          $cleaned.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
        } else {
          $cleaned.SetPixel($x, $y, $pixel)
        }
      }
    }

    $minX = $width
    $minY = $height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        $pixel = $cleaned.GetPixel($x, $y)
        if ($pixel.A -gt 4) {
          if ($x -lt $minX) { $minX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }

    if ($maxX -lt $minX -or $maxY -lt $minY) {
      throw "No visible pixels found after background cleanup for '$resolvedPath'."
    }

    $cropWidth = $maxX - $minX + 1
    $cropHeight = $maxY - $minY + 1
    $cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropWidth, $cropHeight)
    $cropped = $cleaned.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    try {
      $target = [Math]::Max(64, $CanvasSize)
      $usable = [Math]::Max(16, [int][Math]::Floor($target * (1 - ($PaddingRatio * 2))))
      $scale = [Math]::Min($usable / [double]$cropWidth, $usable / [double]$cropHeight)
      $drawWidth = [Math]::Max(1, [int][Math]::Round($cropWidth * $scale))
      $drawHeight = [Math]::Max(1, [int][Math]::Round($cropHeight * $scale))
      $offsetX = [int][Math]::Floor(($target - $drawWidth) / 2)
      $offsetY = [int][Math]::Floor(($target - $drawHeight) / 2)

      $normalized = New-Object System.Drawing.Bitmap($target, $target, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($normalized)
        try {
          $graphics.Clear([System.Drawing.Color]::Transparent)
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.DrawImage($cropped, $offsetX, $offsetY, $drawWidth, $drawHeight)
        } finally {
          $graphics.Dispose()
        }

        $normalized.Save($resolvedPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $normalized.Dispose()
      }
    } finally {
      $cropped.Dispose()
    }
  } finally {
    $cleaned.Dispose()
  }
} finally {
  $bitmap.Dispose()
  $sourceImage.Dispose()
  $memoryStream.Dispose()
}

Write-Output "Normalized '$resolvedPath'. Backup: '$backupPath'"
