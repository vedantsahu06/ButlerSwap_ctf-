$paths = @('server','orchestrator','deprecated','test','artifacts','cache','dist')
foreach ($p in $paths) {
    if (Test-Path $p) {
        Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Output "Removed: $p"
    } else {
        Write-Output "Not present: $p"
    }
}
Write-Output '--- top-level ---'
Get-ChildItem -Force | Select-Object Name, Mode | ConvertTo-Json
