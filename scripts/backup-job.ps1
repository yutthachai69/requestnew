<#
.SYNOPSIS
    Backup ฐานข้อมูล requestonline — ใช้กับ Windows Task Scheduler

.DESCRIPTION
    ทางที่ควรใช้จริงคือ SQL Server Agent Job แต่บนเครื่องนี้ Agent ถูกปิดอยู่
    (StartType = Manual) และการเปิดต้องสิทธิ์ Administrator สคริปต์นี้จึงทำงาน
    ผ่าน Task Scheduler แทน ซึ่งสร้างได้โดยไม่ต้อง elevate

    เมื่อใดที่เปิด SQL Server Agent ได้ ควรย้ายไปเป็น Agent Job เพราะ
    ทำงานได้แม้ไม่มีใคร login อยู่ (ดูข้อจำกัดท้ายไฟล์)

.PARAMETER Mode
    Full = full backup (ตั้งรายวัน)
    Log  = transaction log backup (ตั้งทุก 15 นาที)
           ฐานข้อมูลเป็น recovery model FULL — ถ้าไม่ backup log
           transaction log จะโตจนดิสก์เต็ม

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/backup-job.ps1 -Mode Full
    powershell -ExecutionPolicy Bypass -File scripts/backup-job.ps1 -Mode Log
#>
param(
    [ValidateSet('Full', 'Log')][string]$Mode = 'Full',
    [string]$Server = 'localhost',
    [string]$Database = 'requestonline',
    [string]$BackupDir = 'D:\SQLBackup',
    [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'
$logFile = Join-Path $BackupDir 'backup-job.log'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Output $line
    try { Add-Content -Path $logFile -Value $line -Encoding utf8 } catch { }
}

try {
    if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    if ($Mode -eq 'Full') {
        $file = Join-Path $BackupDir "$Database`_full_$stamp.bak"
        $sql = "BACKUP DATABASE [$Database] TO DISK = N'$file' WITH INIT, CHECKSUM, COMPRESSION"
    } else {
        $file = Join-Path $BackupDir "$Database`_log_$stamp.trn"
        $sql = "BACKUP LOG [$Database] TO DISK = N'$file' WITH CHECKSUM, COMPRESSION"
    }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $output = & sqlcmd -S $Server -E -b -Q $sql 2>&1
    $sw.Stop()

    if ($LASTEXITCODE -ne 0) {
        Write-Log "$Mode backup ล้มเหลว: $($output -join ' ')" 'ERROR'
        exit 1
    }

    $sizeMb = if (Test-Path $file) { [math]::Round((Get-Item $file).Length / 1MB, 1) } else { 0 }
    Write-Log ("$Mode backup สำเร็จ — {0} MB ใน {1:N1} วินาที" -f $sizeMb, $sw.Elapsed.TotalSeconds)

    # ลบไฟล์เก่า — ถ้าไม่ลบ ดิสก์จะเต็มแล้ว backup จะเริ่มล้มแบบเงียบ ๆ
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $old = Get-ChildItem -Path $BackupDir -File |
        Where-Object { ($_.Extension -in '.bak', '.trn') -and $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) {
        Remove-Item -LiteralPath $f.FullName -Force
    }
    if ($old.Count -gt 0) { Write-Log "ลบไฟล์เก่ากว่า $RetentionDays วัน จำนวน $($old.Count) ไฟล์" }

    $free = [math]::Round((Get-PSDrive -Name $BackupDir.Substring(0, 1)).Free / 1GB, 1)
    if ($free -lt 5) { Write-Log "พื้นที่ว่างเหลือ $free GB — เสี่ยงที่ backup จะล้ม" 'WARN' }

    exit 0
} catch {
    Write-Log "ข้อผิดพลาดที่ไม่คาดคิด: $($_.Exception.Message)" 'ERROR'
    exit 1
}

<#
ข้อจำกัดของวิธีนี้ที่ต้องรู้:

1. Task ถูกสร้างโดยไม่ระบุรหัสผ่าน จึงทำงาน "เฉพาะตอนผู้ใช้ล็อกออนอยู่"
   เครื่องนี้เป็น PC ที่เปิดค้างไว้เป็นเซิร์ฟเวอร์จึงพอใช้ได้ แต่ถ้าเครื่อง
   ล็อกออฟหรือรีสตาร์ทแล้วไม่มีใคร login จะไม่มี backup

2. ทางที่ถูกต้องกว่าคือเปิด SQL Server Agent (ต้องสิทธิ์ Administrator ครั้งเดียว)
   แล้วย้าย 2 คำสั่งนี้ไปเป็น Agent Job:
       Start-Service SQLSERVERAGENT
       Set-Service SQLSERVERAGENT -StartupType Automatic
   จากนั้นใช้ scripts/backup-database.sql สร้าง job

3. ยังไม่มีการส่ง alert เมื่อ backup ล้ม — ดูสถานะได้จาก
   D:\SQLBackup\backup-job.log และ query ตรวจสุขภาพใน backup-database.sql
#>
