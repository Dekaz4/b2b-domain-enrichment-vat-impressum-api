#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$')][string]$Owner,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$mirrorRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryName = 'b2b-domain-enrichment-vat-impressum-api'
$allowed = @(
    '.gitignore', 'README.md', 'MARKETPLACES.md', 'github-topics.json',
    'publish-github-mirror.ps1', 'PUBLIC_FILES.json',
    'examples/enrich_domains.py', 'examples/enrich_domains.mjs', 'examples/README.md',
    'workflows/n8n-b2b-domain-vat-enrichment.json', 'workflows/make-com-blueprint.json',
    'workflows/clay-http-api-setup.json', 'workflows/README.md'
)
$allowedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($relative in $allowed) { [void]$allowedSet.Add($relative) }

function Test-PublicText([string]$Relative, [string]$Content) {
    if ($Content.Length -gt 500000) { throw "Unexpectedly large public file: $Relative" }
    $patterns = @(
        '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'apify_api_[A-Za-z0-9]{20,}',
        'gh[pousr]_[A-Za-z0-9]{25,}',
        'github_pat_[A-Za-z0-9_]{25,}',
        '(?i)Bearer\s+[A-Za-z0-9_-]{40,}',
        '(?i)(?:api[_-]?key|authorization|token|secret)["'']?\s*[:=]\s*["''][A-Za-z0-9_-]{30,}["'']',
        '(?i)https?://[^\s/@:]+:[^\s/@]+@'
    )
    foreach ($pattern in $patterns) {
        if ($Content -match $pattern) { throw "Possible credential in $Relative. Review the file privately before publishing." }
    }
    if ($Content -match '(?m)^(?:export )?(?:async )?function (?:scrapePages|extractLegalData|validateEuVat|inspectDomainDns|lookupResultCache|handleRequest)\b') {
        throw "Private engine implementation detected in $Relative."
    }
}
function Test-WorkingFiles {
    $pending = [Collections.Generic.Queue[string]]::new()
    $pending.Enqueue($mirrorRoot)
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    while ($pending.Count) {
        $directory = $pending.Dequeue()
        foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
            $relative = [IO.Path]::GetRelativePath($mirrorRoot, $item.FullName).Replace('\', '/')
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Links/junctions are not publishable: $relative" }
            if ($relative -eq '.git') {
                if (-not $item.PSIsContainer) { throw 'A Git pointer file is not allowed; use an independent repository.' }
                continue
            }
            if ($item.PSIsContainer) {
                if ($relative -notin @('examples', 'workflows')) { throw "Unexpected public directory: $relative" }
                $pending.Enqueue($item.FullName)
                continue
            }
            if (-not $allowedSet.Contains($relative)) { throw "File is not in the public allowlist: $relative" }
            $content = [IO.File]::ReadAllText($item.FullName)
            Test-PublicText $relative $content
            if ($relative.EndsWith('.json')) { $null = $content | ConvertFrom-Json -Depth 100 }
            [void]$seen.Add($relative)
        }
    }
    foreach ($relative in $allowed) { if (-not $seen.Contains($relative)) { throw "Required public file missing: $relative" } }
    $manifest = Get-Content -LiteralPath (Join-Path $mirrorRoot 'PUBLIC_FILES.json') -Raw | ConvertFrom-Json
    if (@(Compare-Object ($allowed | Sort-Object) ($manifest.files | Sort-Object)).Count) { throw 'Public manifest does not match the fixed publisher allowlist.' }
    foreach ($relative in $allowed) {
        if ($relative -eq 'PUBLIC_FILES.json') { continue }
        $expected = $manifest.sha256.PSObject.Properties[$relative].Value
        $actual = (Get-FileHash -LiteralPath (Join-Path $mirrorRoot $relative) -Algorithm SHA256).Hash.ToLowerInvariant()
        if (-not $expected -or $expected -ne $actual) { throw "Public file changed after the private source audit: $relative. Re-audit the release before publishing." }
    }
    $topics = @(Get-Content -LiteralPath (Join-Path $mirrorRoot 'github-topics.json') -Raw | ConvertFrom-Json)
    if ($topics.Count -ne 20 -or @($topics | Select-Object -Unique).Count -ne 20) { throw 'Exactly 20 unique GitHub topics are required.' }
    foreach ($topic in $topics) { if ($topic -notmatch '^[a-z0-9][a-z0-9-]{0,49}$') { throw 'Invalid GitHub topic.' } }
    return ,$topics
}
function Invoke-GitChecked([string[]]$Arguments) {
    $result = & git -c core.hooksPath=NUL -c commit.gpgsign=false -c push.followTags=false @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git command failed: $($Arguments[0])" }
    return $result
}
function Test-History {
    & git rev-parse --verify HEAD 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { return }
    $commits = @(Invoke-GitChecked -Arguments @('rev-list', 'HEAD'))
    if ($commits.Count -gt 1000) { throw 'History is too large for automatic publication auditing.' }
    $checkedBlobs = [Collections.Generic.HashSet[string]]::new()
    $manifest = Get-Content -LiteralPath (Join-Path $mirrorRoot 'PUBLIC_FILES.json') -Raw | ConvertFrom-Json
    $approvedHistory = @($manifest.approved_history_blobs)
    foreach ($commit in $commits) {
        foreach ($entry in @(Invoke-GitChecked -Arguments @('ls-tree', '-r', $commit))) {
            if ($entry -notmatch '^100(?:644|755) blob ([0-9a-f]+)\t(.+)$') { throw 'History contains a symlink, submodule or unsupported object.' }
            $blob = $Matches[1]; $relative = $Matches[2]
            if (-not $allowedSet.Contains($relative)) { throw "Non-public path exists in Git history: $relative" }
            if ($checkedBlobs.Add($blob)) {
                $content = (Invoke-GitChecked -Arguments @('show', $blob)) -join "`n"
                Test-PublicText $relative $content
                $currentBlob = (Invoke-GitChecked -Arguments @('hash-object', '--', $relative)).Trim()
                if ($blob -ne $currentBlob -and $blob -notin $approvedHistory) {
                    throw "Historical file is not sealed by the private source audit: $relative. Run the private audit before publishing this history."
                }
            }
        }
    }
}

Push-Location -LiteralPath $mirrorRoot
try {
    $topics = Test-WorkingFiles
    if ($ValidateOnly) {
        if (Test-Path -LiteralPath (Join-Path $mirrorRoot '.git')) {
            if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required to validate the existing history.' }
            $validationRoot = (Invoke-GitChecked -Arguments @('rev-parse', '--show-toplevel')).Trim()
            if ([IO.Path]::GetFullPath($validationRoot) -ne $mirrorRoot) { throw 'Refusing to audit a parent repository as the public mirror.' }
            Test-History
        }
        Write-Output "PASS: $($allowed.Count) allowlisted files, valid JSON, 20 topics, no detected secrets or engine implementation. No repository or account was changed."
        return
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows, then rerun this script.' }
    if (Test-Path -LiteralPath (Join-Path $mirrorRoot '.git')) {
        $actualRoot = (Invoke-GitChecked -Arguments @('rev-parse', '--show-toplevel')).Trim()
        if ([IO.Path]::GetFullPath($actualRoot) -ne $mirrorRoot) { throw 'Refusing to publish a parent repository.' }
        Test-History
    } else {
        Invoke-GitChecked -Arguments @('init', '--initial-branch=main') | Out-Null
    }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        $login = if ($Owner) { $Owner } else { 'YOUR_GITHUB_LOGIN' }
        Write-Output "GitHub CLI is unavailable. This independent local repository has been initialized."
        Write-Output 'Install GitHub CLI, authenticate with gh auth login, then run:'
        Write-Output ".\publish-github-mirror.ps1 -Owner $login"
        Write-Output "Manual fallback: create an EMPTY PUBLIC repository at https://github.com/new named $repositoryName, owned by $login."
        Write-Output ('git add -- ' + (($allowed | ForEach-Object { "'$_'" }) -join ' '))
        Write-Output "git commit -m 'Add public B2B integration documentation and clients'"
        Write-Output "git remote add origin https://github.com/$login/$repositoryName.git"
        Write-Output 'git -c push.followTags=false push -u origin HEAD:main'
        Write-Output ('Topics to set in About: ' + ($topics -join ', '))
        return
    }
    $login = & gh api user --jq .login 2>$null
    if ($LASTEXITCODE -ne 0 -or $login -notmatch '^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$') { throw 'Run gh auth login first, then rerun the publisher.' }
    if (-not $Owner) { $Owner = $login }
    $repository = "$Owner/$repositoryName"
    $expectedOrigin = "https://github.com/$repository.git"
    $remoteUrls = @(& git remote get-url --push --all origin 2>$null)
    $remote = if ($LASTEXITCODE -eq 0) { $remoteUrls[0] } else { $null }
    if ($remote -and $remoteUrls.Count -ne 1) { throw 'Exactly one Git push destination is permitted.' }
    if ($LASTEXITCODE -eq 0 -and $remote -notin @($expectedOrigin, "https://github.com/$repository", "git@github.com:$repository.git")) { throw 'The existing origin points to a different repository.' }
    Invoke-GitChecked -Arguments (@('add', '--') + $allowed) | Out-Null
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        Invoke-GitChecked -Arguments @('-c', "user.name=$login", '-c', "user.email=$login@users.noreply.github.com", 'commit', '-m', 'Update public domain enrichment integration kit') | Out-Null
    } elseif ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged files.' }
    Test-History
    Invoke-GitChecked -Arguments @('config', '--local', 'push.followTags', 'false') | Out-Null
    $existing = & gh repo view $repository --json nameWithOwner,isPrivate --jq '{name:.nameWithOwner,private:.isPrivate}' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $details = $existing | ConvertFrom-Json
        if ($details.private -or $details.name -ine $repository) { throw 'Refusing to publish over an existing private or mismatched repository.' }
        if (-not $remote) { Invoke-GitChecked -Arguments @('remote', 'add', 'origin', $expectedOrigin) | Out-Null }
        Invoke-GitChecked -Arguments @('push', '-u', 'origin', 'HEAD:main') | Out-Null
    } else {
        if ($remote) { throw 'Existing remote could not be verified. No new repository was created.' }
        & gh repo create $repository --public --source $mirrorRoot --remote origin --push --description 'Public clients and no-code templates for company domains, EU VAT VIES, German Impressum and email DNS.' --homepage 'https://apify.com/dekaz/global-b2b-intelligence-engine'
        if ($LASTEXITCODE -ne 0) { throw 'GitHub creation or push failed; inspect account state before retrying.' }
    }
    $editArguments = @('repo', 'edit', $repository)
    foreach ($topic in $topics) { $editArguments += @('--add-topic', $topic) }
    & gh @editArguments
    if ($LASTEXITCODE -ne 0) { throw 'Files were pushed but topics were not confirmed. Rerun this script to finish metadata.' }
    Write-Output "Published public integration files: https://github.com/$repository"
} finally { Pop-Location }
