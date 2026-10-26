# VISUALISER — stop-all.ps1
# Stops whatever is LISTENING on the three service ports (5000 ML, 8080 Go, 5173 Vite).
# (The old version assigned to $pid, which is a read-only PowerShell variable.)
Write-Host "Stopping VISUALISER services..."
foreach ($port in 5000, 8080, 5173) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Host "  port $port -> PID $($_.OwningProcess)"
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "Done."
