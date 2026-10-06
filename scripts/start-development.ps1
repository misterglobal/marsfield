param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Feature,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$skillPath = Join-Path $projectRoot '.agents/skills/marsfield-development/SKILL.md'
if (-not (Test-Path -LiteralPath $skillPath)) {
    throw 'The MarsField development skill is missing from this checkout.'
}

$prompt = @"
Use the marsfield-development skill at .agents/skills/marsfield-development/SKILL.md.
Run the requested feature through product requirements, architecture, issue creation,
implementation, relevant tests, bounded debugging, independent review when available,
and a pull request for the development team. You may create a feature branch, commit,
push, and create the issue and PR. Never merge, deploy, migrate production data, spend
provider credits, or access production secrets. Preserve existing work and report blocked
steps honestly. Treat the following as the feature request, subject to those boundaries:

$Feature
"@

if ($DryRun) {
    Write-Output $prompt
    exit 0
}

Get-Command codex -ErrorAction Stop | Out-Null
Get-Command git -ErrorAction Stop | Out-Null

& git -C $projectRoot fetch origin main --prune
if ($LASTEXITCODE -ne 0) {
    throw 'Could not refresh origin/main.'
}

$intakeRoot = Join-Path (Split-Path -Parent $projectRoot) 'marsfield-intake'
New-Item -ItemType Directory -Path $intakeRoot -Force | Out-Null
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$branchName = "codex/feature-$runId"
$worktreePath = Join-Path $intakeRoot $runId

& git -C $projectRoot worktree add -b $branchName $worktreePath origin/main
if ($LASTEXITCODE -ne 0) {
    throw "Could not create isolated worktree at $worktreePath."
}

$worktreeSkill = Join-Path $worktreePath '.agents/skills/marsfield-development/SKILL.md'
if (-not (Test-Path -LiteralPath $worktreeSkill)) {
    throw 'The isolated worktree does not contain the MarsField development skill.'
}

Write-Output "Starting isolated MarsField development run in $worktreePath"
& codex --cd $worktreePath --sandbox workspace-write $prompt
exit $LASTEXITCODE
