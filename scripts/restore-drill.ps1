<#
.SYNOPSIS
    ซ้อมกู้ฐานข้อมูล (restore drill) — พิสูจน์ว่า backup กู้กลับมาใช้งานได้จริง

.DESCRIPTION
    การ backup สำเร็จไม่ได้แปลว่ากู้ได้ สคริปต์นี้จึงกู้ไฟล์ backup กลับมาเป็น
    "ฐานข้อมูลคนละตัว" แล้วตรวจความสมบูรณ์ + เทียบจำนวนแถวกับตัวจริง
    พร้อมจับเวลาเพื่อให้รู้ RTO ที่แท้จริง

    ไม่แตะฐานข้อมูลตัวจริงเลย — การ backup เป็นการอ่านอย่างเดียว
    และการกู้ทำลงฐานข้อมูลชื่อใหม่

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/restore-drill.ps1
    powershell -ExecutionPolicy Bypass -File scripts/restore-drill.ps1 -Cleanup
#>
param(
    [string]$Server = 'localhost',
    [string]$SourceDatabase = 'requestonline',
    [string]$DrillDatabase = 'requestonline_drill',
    [string]$BackupPath = '',
    [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'

function Invoke-Sql {
    param([string]$Query, [string]$Database = 'master', [int]$TimeoutSec = 600)
    $output = & sqlcmd -S $Server -E -d $Database -b -t $TimeoutSec -Q $Query -W -s '|' 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "SQL ล้มเหลว: $($output -join [Environment]::NewLine)"
    }
    return $output
}

function Get-ScalarSql {
    param([string]$Query, [string]$Database = 'master')
    $output = & sqlcmd -S $Server -E -d $Database -b -h -1 -Q "SET NOCOUNT ON; $Query" -W 2>&1
    if ($LASTEXITCODE -ne 0) { throw "SQL ล้มเหลว: $($output -join [Environment]::NewLine)" }
    return ($output | Where-Object { $_ -ne '' } | Select-Object -First 1)
}

if ($Cleanup) {
    Write-Host "ลบฐานข้อมูลซ้อม $DrillDatabase ..." -ForegroundColor Yellow
    Invoke-Sql "IF DB_ID('$DrillDatabase') IS NOT NULL BEGIN ALTER DATABASE [$DrillDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DrillDatabase]; END" | Out-Null
    Write-Host "ลบเรียบร้อย" -ForegroundColor Green
    exit 0
}

if (-not $BackupPath) {
    $defaultPath = (Get-ScalarSql "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath'))").Trim()
    $BackupPath = Join-Path $defaultPath "$SourceDatabase`_drill.bak"
}

Write-Host ''
Write-Host '=== ซ้อมกู้ฐานข้อมูล (Restore Drill) ===' -ForegroundColor Cyan
Write-Host "  ต้นทาง : $SourceDatabase"
Write-Host "  ปลายทาง: $DrillDatabase (สร้างใหม่ ไม่ทับของจริง)"
Write-Host "  ไฟล์   : $BackupPath"
Write-Host ''

# ── 1. Full backup ──────────────────────────────────────────────────────────
Write-Host '[1/6] Full backup ...' -ForegroundColor Cyan
$swBackup = [Diagnostics.Stopwatch]::StartNew()
Invoke-Sql "BACKUP DATABASE [$SourceDatabase] TO DISK = N'$BackupPath' WITH INIT, CHECKSUM, COMPRESSION, STATS = 25" | Out-Null
$swBackup.Stop()
# อ่านขนาดจาก msdb แทนระบบไฟล์ — โฟลเดอร์ backup ของ SQL Server อาจไม่มีสิทธิ์อ่าน
$backupSizeMb = (Get-ScalarSql "SELECT CAST(compressed_backup_size/1048576.0 AS DECIMAL(10,1)) FROM msdb.dbo.backupset WHERE database_name=N'$SourceDatabase' ORDER BY backup_finish_date DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY").Trim()
Write-Host ("      เสร็จใน {0:N1} วินาที — ขนาด {1} MB" -f $swBackup.Elapsed.TotalSeconds, $backupSizeMb) -ForegroundColor Green

# ── 2. ตรวจไฟล์ backup ก่อนกู้ ──────────────────────────────────────────────
Write-Host '[2/6] ตรวจความสมบูรณ์ของไฟล์ backup (RESTORE VERIFYONLY) ...' -ForegroundColor Cyan
Invoke-Sql "RESTORE VERIFYONLY FROM DISK = N'$BackupPath' WITH CHECKSUM" | Out-Null
Write-Host '      ไฟล์ backup ไม่เสียหาย' -ForegroundColor Green

# ── 3. กู้เป็นฐานข้อมูลชื่อใหม่ ─────────────────────────────────────────────
Write-Host "[3/6] กู้กลับเป็น $DrillDatabase ..." -ForegroundColor Cyan
$dataDir = (Get-ScalarSql "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath'))").Trim()
$logDir  = (Get-ScalarSql "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultLogPath'))").Trim()

$fileList = & sqlcmd -S $Server -E -b -h -1 -Q "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'$BackupPath'" -W -s '|' 2>&1
if ($LASTEXITCODE -ne 0) { throw "อ่านรายการไฟล์ใน backup ไม่ได้: $fileList" }

$moveClauses = @()
foreach ($line in $fileList) {
    if ($line -notmatch '\|') { continue }
    $parts = $line -split '\|'
    $logicalName = $parts[0].Trim()
    $type = $parts[2].Trim()
    if ($logicalName -eq '' -or $logicalName -match '^-+$') { continue }
    $ext = if ($type -eq 'L') { 'ldf' } else { 'mdf' }
    $targetDir = if ($type -eq 'L') { $logDir } else { $dataDir }
    $target = Join-Path $targetDir "$DrillDatabase`_$logicalName.$ext"
    $moveClauses += "MOVE N'$logicalName' TO N'$target'"
}
if ($moveClauses.Count -eq 0) { throw 'ไม่พบไฟล์ในชุด backup' }

Invoke-Sql "IF DB_ID('$DrillDatabase') IS NOT NULL BEGIN ALTER DATABASE [$DrillDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DrillDatabase]; END" | Out-Null

$swRestore = [Diagnostics.Stopwatch]::StartNew()
Invoke-Sql "RESTORE DATABASE [$DrillDatabase] FROM DISK = N'$BackupPath' WITH $($moveClauses -join ', '), RECOVERY, STATS = 25" | Out-Null
$swRestore.Stop()
Write-Host ("      กู้เสร็จใน {0:N1} วินาที" -f $swRestore.Elapsed.TotalSeconds) -ForegroundColor Green

# ── 4. ตรวจความสมบูรณ์ของฐานข้อมูลที่กู้มา ─────────────────────────────────
Write-Host '[4/6] DBCC CHECKDB ...' -ForegroundColor Cyan
$swCheck = [Diagnostics.Stopwatch]::StartNew()
$checkOutput = Invoke-Sql "DBCC CHECKDB([$DrillDatabase]) WITH NO_INFOMSGS, ALL_ERRORMSGS"
$swCheck.Stop()
$checkErrors = $checkOutput | Where-Object { $_ -match 'Msg |error|consisten' }
if ($checkErrors) {
    Write-Host '      พบปัญหา:' -ForegroundColor Red
    $checkErrors | ForEach-Object { Write-Host "        $_" -ForegroundColor Red }
    throw 'DBCC CHECKDB ไม่ผ่าน'
}
Write-Host ("      ไม่พบความเสียหาย ({0:N1} วินาที)" -f $swCheck.Elapsed.TotalSeconds) -ForegroundColor Green

# ── 5. เทียบจำนวนแถวกับต้นฉบับ ──────────────────────────────────────────────
Write-Host '[5/6] เทียบจำนวนแถวทุกตาราง ...' -ForegroundColor Cyan
$rowCountQuery = @"
SET NOCOUNT ON;
SELECT t.name + '=' + CAST(SUM(p.rows) AS varchar(20))
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
GROUP BY t.name ORDER BY t.name;
"@
$sourceRows = @{}
foreach ($line in (& sqlcmd -S $Server -E -d $SourceDatabase -b -h -1 -Q $rowCountQuery -W 2>&1)) {
    if ($line -match '^(.+)=(\d+)$') { $sourceRows[$Matches[1]] = [int]$Matches[2] }
}
$drillRows = @{}
foreach ($line in (& sqlcmd -S $Server -E -d $DrillDatabase -b -h -1 -Q $rowCountQuery -W 2>&1)) {
    if ($line -match '^(.+)=(\d+)$') { $drillRows[$Matches[1]] = [int]$Matches[2] }
}

$mismatches = @()
foreach ($table in $sourceRows.Keys) {
    if ($drillRows[$table] -ne $sourceRows[$table]) {
        $mismatches += "$table : ต้นฉบับ $($sourceRows[$table]) / กู้มา $($drillRows[$table])"
    }
}
if ($mismatches.Count -gt 0) {
    # ต้นฉบับอาจมีการเขียนเพิ่มระหว่าง backup — รายงานไว้ให้ตรวจ ไม่ถือว่าล้มเหลวทันที
    Write-Host '      จำนวนแถวไม่ตรงบางตาราง (อาจมีการเขียนหลัง backup):' -ForegroundColor Yellow
    $mismatches | ForEach-Object { Write-Host "        $_" -ForegroundColor Yellow }
} else {
    Write-Host "      ตรงกันครบ $($sourceRows.Count) ตาราง" -ForegroundColor Green
}

# ── 6. สรุป ────────────────────────────────────────────────────────────────
Write-Host '[6/6] สรุป' -ForegroundColor Cyan
$totalMin = ($swBackup.Elapsed.TotalSeconds + $swRestore.Elapsed.TotalSeconds + $swCheck.Elapsed.TotalSeconds) / 60
Write-Host ''
Write-Host '  ขั้นตอน                 เวลา'
Write-Host '  ---------------------------------'
Write-Host ("  Backup            {0,8:N1} วินาที" -f $swBackup.Elapsed.TotalSeconds)
Write-Host ("  Restore           {0,8:N1} วินาที" -f $swRestore.Elapsed.TotalSeconds)
Write-Host ("  DBCC CHECKDB      {0,8:N1} วินาที" -f $swCheck.Elapsed.TotalSeconds)
Write-Host ("  รวม (RTO ฐานข้อมูล) {0,6:N1} นาที" -f $totalMin) -ForegroundColor Green
Write-Host ''
Write-Host "  ขั้นถัดไป: ชี้แอปไปที่ $DrillDatabase แล้วรันชุดเทส เพื่อพิสูจน์ว่าใช้งานได้จริง" -ForegroundColor Cyan
Write-Host "    `$env:MSSQL_DATABASE='$DrillDatabase'; npm run start"
Write-Host "    `$env:TEST_BASE_URL='http://localhost:3000'; npm run test:e2e"
Write-Host ''
Write-Host "  ล้างเมื่อเสร็จ: powershell -File scripts/restore-drill.ps1 -Cleanup" -ForegroundColor Yellow
Write-Host ''
