$ErrorActionPreference = 'Stop'

$pptxPath = Join-Path $PSScriptRoot 'Sakshya_SIH_Pitch_Deck.pptx'
$pdfPath = Join-Path $PSScriptRoot 'Sakshya_SIH_Pitch_Deck.pdf'
$powerPoint = $null
$presentation = $null

function Rgb([int]$red, [int]$green, [int]$blue) {
  return $red + ($green * 256) + ($blue * 65536)
}

$navy = Rgb 11 31 58
$navy2 = Rgb 20 49 82
$ink = Rgb 25 43 63
$muted = Rgb 93 111 131
$line = Rgb 220 228 237
$paper = Rgb 247 249 252
$white = Rgb 255 255 255
$saffron = Rgb 236 157 42
$green = Rgb 32 132 98
$blue = Rgb 58 117 176
$red = Rgb 183 73 68
$teal = Rgb 41 143 151

function Add-Text($slide, [string]$text, [double]$left, [double]$top, [double]$width, [double]$height, [double]$size, [int]$color, [bool]$bold = $false, [string]$font = 'Arial') {
  $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
  $shape.TextFrame.MarginLeft = 0
  $shape.TextFrame.MarginRight = 0
  $shape.TextFrame.MarginTop = 0
  $shape.TextFrame.MarginBottom = 0
  $shape.TextFrame.WordWrap = -1
  $shape.TextFrame.AutoSize = 0
  $shape.TextFrame.TextRange.Text = $text
  $shape.TextFrame.TextRange.Font.Name = $font
  $shape.TextFrame.TextRange.Font.Size = $size
  $shape.TextFrame.TextRange.Font.Bold = [int]$bold
  $shape.TextFrame.TextRange.Font.Color.RGB = $color
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 0
  $shape.Height = $height
  return $shape
}

function Add-Box($slide, [double]$left, [double]$top, [double]$width, [double]$height, [int]$fill, [int]$stroke = -1, [int]$shapeType = 5) {
  $shape = $slide.Shapes.AddShape($shapeType, $left, $top, $width, $height)
  $shape.Fill.ForeColor.RGB = $fill
  if ($stroke -eq -1) {
    $shape.Line.Visible = 0
  } else {
    $shape.Line.Visible = -1
    $shape.Line.ForeColor.RGB = $stroke
    $shape.Line.Weight = 1
  }
  return $shape
}

function New-Slide([int]$background = $paper) {
  $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)
  $slide.FollowMasterBackground = 0
  $slide.Background.Fill.ForeColor.RGB = $background
  return $slide
}

function Add-Header($slide, [string]$section, [string]$title, [string]$subtitle, [string]$source) {
  Add-Text $slide $section.ToUpper() 48 27 860 16 9 $blue $true | Out-Null
  Add-Text $slide $title 48 51 870 42 27 $navy $true | Out-Null
  if ($subtitle) { Add-Text $slide $subtitle 48 98 860 28 12 $muted $false | Out-Null }
  Add-Box $slide 48 501 864 1 $line $line 1 | Out-Null
  Add-Text $slide "SAKSHYA  /  SIH PITCH  /  PROTOTYPE v1.0" 48 510 530 15 8 $muted $true | Out-Null
  Add-Text $slide $source 48 482 805 14 7 $muted $false | Out-Null
  Add-Text $slide ('{0:D2}' -f $presentation.Slides.Count) 872 510 40 15 8 $muted $true | Out-Null
}

function Add-Card($slide, [double]$x, [double]$y, [double]$w, [double]$h, [string]$title, [string]$body, [int]$accent = $blue, [double]$titleSize = 15, [double]$bodySize = 11) {
  Add-Box $slide $x $y $w $h $white $line | Out-Null
  Add-Box $slide $x $y 5 $h $accent $accent 1 | Out-Null
  Add-Text $slide $title ($x + 18) ($y + 15) ($w - 34) 27 $titleSize $navy $true | Out-Null
  Add-Text $slide $body ($x + 18) ($y + 48) ($w - 34) ($h - 58) $bodySize $ink $false | Out-Null
}

function Add-Chip($slide, [double]$x, [double]$y, [double]$w, [string]$text, [int]$fill, [int]$foreground = $white) {
  Add-Box $slide $x $y $w 25 $fill $fill | Out-Null
  $shape = Add-Text $slide $text $x ($y + 5) $w 15 8 $foreground $true
  $shape.TextFrame.TextRange.ParagraphFormat.Alignment = 2
}

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = -1
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideSize = 7
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  # 01 — Cover
  $s = New-Slide $navy
  Add-Box $s 0 0 960 9 $saffron $saffron 1 | Out-Null
  Add-Text $s 'SAKSHYA' 62 48 500 32 17 $white $true | Out-Null
  Add-Text $s 'साक्ष्य  /  Evidence' 62 84 500 22 12 (Rgb 202 215 230) $false | Out-Null
  Add-Text $s "AICTE security deposits,`nwith evidence at every step." 62 161 780 115 34 $white $true | Out-Null
  Add-Text $s 'A single, accountable journey from institute FDR submission to verified release and settlement.' 64 294 715 56 16 (Rgb 211 222 235) $false | Out-Null
  Add-Chip $s 64 390 126 'SIH 2026' $saffron $navy
  Add-Chip $s 202 390 185 'PROTOTYPE v1.0' $navy2 $white
  Add-Text $s 'Evidence-led workflow  /  Role-based control  /  Verifiable letters' 64 457 780 24 11 (Rgb 202 215 230) $false | Out-Null
  Add-Text $s 'Sakshya = evidence / witness | Source: SRS-SAK-001, §§1.1–1.4' 64 510 740 16 8 (Rgb 168 187 208) $false | Out-Null
  Add-Text $s '01' 874 510 35 16 8 (Rgb 168 187 208) $true | Out-Null

  # 02 — Problem
  $s = New-Slide
  Add-Header $s '01 / The problem' 'A deposit is only as trustworthy as its evidence.' 'The workflow breaks when records, verification and deadlines live in different places.' 'Source: SRS §§1.2–1.3'
  Add-Card $s 48 151 420 132 'Scattered records' 'Files, email and registers create fragmented views of institute obligations and FDRs.' $blue
  Add-Card $s 492 151 420 132 'Claims mistaken for facts' 'An uploaded receipt is an institute claim; it is not independent proof of a valid lien.' $saffron
  Add-Card $s 48 306 420 132 'Time depends on memory' 'Maturity, renewal and follow-up dates can be missed when tracking is manual.' $teal
  Add-Card $s 492 306 420 132 'Release lacks a visible chain' 'Eligibility, signing, bank execution and AICTE credit need distinct owners and evidence.' $green
  Add-Text $s 'Design response: one versioned case record, explicit trust levels and auditable state changes.' 48 451 860 24 12 $navy $true | Out-Null

  # 03 — Solution
  $s = New-Slide
  Add-Header $s '02 / The solution' 'One case record. Evidence grows; authority stays separated.' 'Sakshya connects institute, bank, officer, Release Authority and Finance around a shared lifecycle.' 'Source: SRS §§1.2, 7.2, 9.1'
  $steps = @(
    @{ x = 48; n = '01'; t = 'Submit'; b = 'Institute submits FDR details and document.'; c = $blue },
    @{ x = 269; n = '02'; t = 'Verify'; b = 'Checks raise explainable flags; bank confirms directly.'; c = $teal },
    @{ x = 490; n = '03'; t = 'Monitor'; b = 'Track obligation, maturity, renewal and exceptions.'; c = $saffron },
    @{ x = 711; n = '04'; t = 'Release'; b = 'Eligibility, signed letter, bank execution, settlement.'; c = $green }
  )
  foreach ($step in $steps) {
    Add-Box $s $step.x 207 190 184 $white $line | Out-Null
    Add-Box $s $step.x 207 190 8 $step.c $step.c 1 | Out-Null
    Add-Text $s $step.n ($step.x + 17) 232 56 28 19 $step.c $true | Out-Null
    Add-Text $s $step.t ($step.x + 17) 275 155 27 17 $navy $true | Out-Null
    Add-Text $s $step.b ($step.x + 17) 315 155 57 11 $ink $false | Out-Null
  }
  foreach ($x in @(246, 467, 688)) {
    Add-Text $s '>' $x 282 16 20 18 $muted $true | Out-Null
  }
  Add-Text $s 'No single upload or automated flag can promote a claimed value to a bank-confirmed fact.' 48 423 860 32 14 $navy $true | Out-Null

  # 04 — Trust chain / USP U1-U4
  $s = New-Slide
  Add-Header $s '03 / What is different' 'Trust is field-level—not a green tick on a whole file.' 'Evidence, provenance and uncertainty remain visible as a case moves forward.' 'Source: SRS §§1.4, 1.5; U1–U4'
  $trust = @(
    @{ x = 74; label = 'L0'; title = 'Claimed'; body = "Institute-submitted value`nEvidence: submitted document"; c = $muted },
    @{ x = 365; label = 'L1'; title = 'Attested'; body = "Officer-reviewed value`nEvidence: review and audit"; c = $saffron },
    @{ x = 656; label = 'L2'; title = 'Bank-confirmed'; body = "Bank-confirmed value`nEvidence: direct bank response"; c = $green }
  )
  foreach ($item in $trust) {
    Add-Box $s $item.x 178 230 177 $white $line | Out-Null
    Add-Box $s $item.x 178 230 7 $item.c $item.c 1 | Out-Null
    Add-Text $s $item.label ($item.x + 18) 201 190 34 24 $item.c $true | Out-Null
    Add-Text $s $item.title ($item.x + 18) 245 192 28 16 $navy $true | Out-Null
    Add-Text $s $item.body ($item.x + 18) 289 192 52 11 $muted $false | Out-Null
  }
  Add-Text $s 'U1 Trust chain' 74 389 180 20 10 $navy $true | Out-Null
  Add-Text $s 'U2 Hybrid lien: institute authorises; bank confirms directly to AICTE.' 74 411 780 22 11 $ink $false | Out-Null
  Add-Text $s 'U4 Document checks flag inconsistencies; they never approve or reject a deposit.' 74 437 800 22 11 $ink $false | Out-Null

  # 05 — USPs U3, U5-U8
  $s = New-Slide
  Add-Header $s '04 / Product principles' 'Designed for explainability, continuity and accountability.' 'Five controls turn the workflow into a chain of evidence—not just a form and a status.' 'Source: SRS §1.4; U3, U5–U8'
  Add-Card $s 48 151 420 127 'U3  Verifiable release letter' 'Hash-bound, QR-linked, time-limited and revocable; the bank checks status before acting.' $blue 14 10
  Add-Card $s 492 151 420 127 'U5  Continuous assurance' 'Risk-based bank reconciliation helps surface lien changes and other exceptions.' $teal 14 10
  Add-Card $s 48 300 420 127 'U6  Rules as configuration' 'Policy values are versioned/configurable rather than buried in business logic.' $saffron 14 10
  Add-Card $s 492 300 420 127 'U7  Explainable priority' 'Officers see why a case is prioritised, not only a score.' $green 14 10
  Add-Box $s 48 451 864 28 $navy $navy | Out-Null
  Add-Text $s 'U8  Tamper-evident audit  /  State changes are attributable and linked in an integrity-checkable trail.' 64 458 832 18 10 $white $true | Out-Null

  # 06 — Architecture
  $s = New-Slide
  Add-Header $s '05 / Feasibility' 'A simple prototype stack; production adapters stay explicit.' 'The v1.0 plan prioritises a runnable vertical slice and honest simulator boundaries.' 'Source: 4-Day Plan §§1.2–1.3; SRS §§3.1–3.6, Appendix H'
  Add-Box $s 48 153 864 69 $navy $navy | Out-Null
  Add-Text $s 'PEOPLE & WORKSPACES' 68 165 170 15 8 (Rgb 193 210 228) $true | Out-Null
  Add-Text $s 'Institute  •  Officer  •  Bank  •  Release Authority  •  Finance  •  Public verifier' 68 187 806 22 13 $white $true | Out-Null
  Add-Box $s 48 243 864 74 $white $line | Out-Null
  Add-Text $s 'WEB APP' 66 255 120 15 8 $blue $true | Out-Null
  Add-Text $s 'React + TypeScript  /  Vite  /  role-aware routes  /  English + Hindi' 66 279 815 21 12 $ink $true | Out-Null
  Add-Box $s 48 338 864 84 $white $line | Out-Null
  Add-Text $s 'API & DOMAIN' 66 350 120 15 8 $teal $true | Out-Null
  Add-Text $s 'FastAPI modules: intake  •  bank  •  monitoring  •  release  •  insights' 66 372 815 20 12 $ink $true | Out-Null
  Add-Text $s 'Role checks  /  state machines  /  policy  /  audit chain  /  API contracts' 66 394 815 17 9 $muted $false | Out-Null
  Add-Box $s 48 439 420 36 $white $line | Out-Null
  Add-Text $s 'Prototype: SQLite  /  local files  /  in-process jobs' 61 450 395 15 9 $ink $true | Out-Null
  Add-Box $s 492 439 420 36 $white $line | Out-Null
  Add-Text $s 'Adapters: portal bank  /  simulated signer  /  local IdP' 505 450 395 15 9 $ink $true | Out-Null

  # 07 — Demo story intake
  $s = New-Slide
  Add-Header $s '06 / Demo story 1' 'From an institute claim to evidence-backed activation.' 'Planned walkthrough: submission, explainable flags, direct bank confirmation and role separation.' 'Source: 4-Day Plan §1.1 G1–G8; SRS E2E-02, 03, 08, 09'
  $demo1 = @(
    @{ x = 48; tag = '01  INSTITUTE'; title = 'Submit'; body = "Upload genuine FDR`nReview extracted fields`nSubmit as L0 claim"; c = $blue },
    @{ x = 269; tag = '02  CHECKS'; title = 'Inspect'; body = "Show plain-language flags`nCompare document fields`nFlags are not decisions"; c = $saffron },
    @{ x = 490; tag = '03  BANK'; title = 'Confirm'; body = "Use verified directory`nMaker + checker review`nCritical fields move to L2"; c = $teal },
    @{ x = 711; tag = '04  OFFICER'; title = 'Activate'; body = "Show SoD rejection`nUse a different approver`nActivate after checks"; c = $green }
  )
  foreach ($item in $demo1) {
    Add-Box $s $item.x 193 190 205 $white $line | Out-Null
    Add-Text $s $item.tag ($item.x + 16) 210 160 15 8 $item.c $true | Out-Null
    Add-Text $s $item.title ($item.x + 16) 240 160 26 16 $navy $true | Out-Null
    Add-Text $s $item.body ($item.x + 16) 285 158 88 10 $ink $false | Out-Null
  }
  Add-Text $s 'Demo truth: seed data and backend availability determine which transitions can be shown live.' 48 427 860 24 11 $muted $false | Out-Null

  # 08 — Demo story release
  $s = New-Slide
  Add-Header $s '07 / Demo story 2' 'A release is not complete when a letter is signed.' 'Show the independent checks from eligibility to final AICTE-share settlement.' 'Source: 4-Day Plan §1.1 G9–G12; SRS E2E-13…17'
  $demo2 = @(
    @{ x = 48; t = 'Eligibility'; b = "Hold blocks release`nShow reason + fix hint`nLift hold; AO recommends"; c = $blue },
    @{ x = 269; t = 'Signed letter'; b = "RA completes step-up`nPDF carries QR + hash`n14-day validity per spec"; c = $saffron },
    @{ x = 490; t = 'Bank execution'; b = "Public status check`nMaker / checker record UTR`nReplay is rejected"; c = $teal },
    @{ x = 711; t = 'Finance + audit'; b = "Confirm AICTE share`nMismatch needs a reason`nClose; verify audit chain"; c = $green }
  )
  foreach ($item in $demo2) {
    Add-Box $s $item.x 190 190 196 $white $line | Out-Null
    Add-Box $s $item.x 190 190 6 $item.c $item.c 1 | Out-Null
    Add-Text $s $item.t ($item.x + 16) 218 158 27 15 $navy $true | Out-Null
    Add-Text $s $item.b ($item.x + 16) 265 158 94 10 $ink $false | Out-Null
  }
  Add-Text $s 'A signed release is verifiable, single-use and revocable by design (per SRS); do not claim a live bank transfer.' 48 416 860 36 11 $navy $true | Out-Null

  # 09 — KPI plan
  $s = New-Slide
  Add-Header $s '08 / Impact measurement' 'Measure outcomes; do not invent a baseline.' 'The project defines what to measure. No before/after improvement is claimed in this deck.' 'Source: SRS T-202; §9.1'
  $kpis = @(
    @{ y = 148; label = 'Record accuracy'; formula = 'Instruments with L2 on every critical field / eligible instruments'; tag = 'MEASURED FROM DATA' },
    @{ y = 211; label = 'Verification turnaround'; formula = 'Submit → bank-confirmed median and p90'; tag = 'MEASURED FROM TIMESTAMPS' },
    @{ y = 274; label = 'Timely renewals'; formula = 'Renewals accepted before maturity / renewals due'; tag = 'MEASURED FROM CASES' },
    @{ y = 337; label = 'Manual effort'; formula = 'Automated actions counted; officer touch time estimated from audit events'; tag = 'ESTIMATE; BASELINE SOURCE REQUIRED' },
    @{ y = 400; label = 'Fraud-catch'; formula = 'Precision / recall on labelled synthetic corpus only'; tag = 'SYNTHETIC; NOT FIELD ACCURACY' }
  )
  foreach ($item in $kpis) {
    Add-Box $s 48 $item.y 864 52 $white $line | Out-Null
    Add-Text $s $item.label 62 ($item.y + 9) 190 19 11 $navy $true | Out-Null
    Add-Text $s $item.formula 252 ($item.y + 8) 445 36 9 $ink $false | Out-Null
    Add-Chip $s 715 ($item.y + 14) 180 $item.tag $navy2 $white
  }

  # 10 — Capability map
  $s = New-Slide
  Add-Header $s '09 / Judge checklist' 'Ten expected capabilities, mapped to visible evidence.' 'Use this as a review checklist; feature availability and live API state vary by module.' 'Source: SRS §9.1; capability names condensed'
  $capabilities = @(
    @('01  Repository', 'Institute obligations + FDR register', $blue),
    @('02  Documents', 'FDR upload, preview + records', $teal),
    @('03  Verification', 'Bank confirmation + discrepancy flags', $saffron),
    @('04  Validity', 'Maturity windows + alerts', $green),
    @('05  Renewal', 'Renewal and replacement tracking', $blue),
    @('06  Release', 'Eligibility → sign → verify → settle', $teal),
    @('07  Alerts', 'Notifications + escalation', $saffron),
    @('08  Reporting', 'KPI dashboard + reports', $green),
    @('09  Audit & access', 'Role guards + integrity-checkable audit', $blue),
    @('10  Integration', 'Bank/signer adapters + public verifier', $teal)
  )
  for ($i = 0; $i -lt $capabilities.Count; $i++) {
    $col = $i % 2
    $row = [math]::Floor($i / 2)
    $x = 48 + ($col * 444)
    $y = 145 + ($row * 67)
    Add-Box $s $x $y 420 55 $white $line | Out-Null
    Add-Box $s $x $y 5 55 $capabilities[$i][2] $capabilities[$i][2] 1 | Out-Null
    Add-Text $s $capabilities[$i][0] ($x + 15) ($y + 7) 385 17 10 $navy $true | Out-Null
    Add-Text $s $capabilities[$i][1] ($x + 15) ($y + 29) 385 17 8 $ink $false | Out-Null
  }
  Add-Text $s 'Checklist status is not a certification: verify each item against the current build and its test evidence.' 48 491 860 15 9 $red $true | Out-Null

  # 11 — Impact boundaries
  $s = New-Slide
  Add-Header $s '10 / Feasibility & honesty' 'What v1.0 demonstrates—and what remains a boundary.' 'A prototype can prove workflow logic without pretending to be a production integration.' 'Source: 4-Day Plan §§1.2–1.3, 10; SRS Appendix H'
  Add-Card $s 48 153 420 128 'Demonstrates in the prototype' "Role-based journeys and interfaces`nRule-driven workflow states`nSynthetic, fictional demo records`nAPI contracts and adapter seams" $green 14 10
  Add-Card $s 492 153 420 128 'Not a production integration' "No real bank core/SFMS connection`nNo fund movement by Sakshya`nSoftware signing is simulated`nPolicy defaults still need validation" $saffron 14 10
  Add-Card $s 48 301 420 128 'Safe interpretation' "Document heuristics surface flags`nA flag is not proof of fraud`nBank confirmation is a distinct step`nHuman authority remains explicit" $blue 14 10
  Add-Card $s 492 301 420 128 'Current verification status' "PA-1–PA-4 frontend flows exist`nBuild and lint checks pass`nSelected flows tested with mocks`nLive end-to-end depends on API readiness" $teal 14 10
  Add-Text $s 'Data labels: synthetic = demo corpus  /  assumed = unvalidated baseline  /  measured = computed from a stated dataset.' 48 451 860 22 10 $navy $true | Out-Null

  # 12 — Roadmap
  $s = New-Slide
  Add-Header $s '11 / Roadmap' 'Move from a runnable slice to an operable public service.' 'Sequence the next investments around verified needs, integrations and governance.' 'Source: 4-Day Plan §10; SRS Appendix H'
  $roadmap = @(
    @{ x = 48; phase = 'NOW  /  PROTOTYPE'; title = 'Prove the golden path'; body = "Complete backend/API integration`nRehearse seeded scenarios`nClose known issues + test evidence"; c = $blue },
    @{ x = 344; phase = 'NEXT  /  HARDEN'; title = 'Strengthen operations'; body = "PostgreSQL + migrations`nObject storage + job queue`nCI, security and observability"; c = $teal },
    @{ x = 640; phase = 'LATER  /  CONNECT'; title = 'Integrate with institutions'; body = "Bank channel adapters`nProvider-backed eSign + KMS/HSM`nGovernment hosting + validated policy"; c = $saffron }
  )
  foreach ($item in $roadmap) {
    Add-Box $s $item.x 177 270 226 $white $line | Out-Null
    Add-Box $s $item.x 177 270 7 $item.c $item.c 1 | Out-Null
    Add-Text $s $item.phase ($item.x + 18) 199 235 16 8 $item.c $true | Out-Null
    Add-Text $s $item.title ($item.x + 18) 237 235 32 16 $navy $true | Out-Null
    Add-Text $s $item.body ($item.x + 18) 287 230 90 10 $ink $false | Out-Null
  }
  Add-Text $s 'Also validate regulatory/policy values with AICTE and mentors before operational use.' 48 435 860 24 12 $navy $true | Out-Null

  # 13 — Q&A
  $s = New-Slide
  Add-Header $s '12 / Judge Q&A' 'Hard questions deserve precise answers.' 'Use the boundary—not a promise—as the answer when evidence is not yet available.' 'Source: SRS §§1.2, 2.5, 3.6, Appendix H; 4-Day Plan §§1.2, 10'
  Add-Card $s 48 143 420 101 'Bank API availability?' 'Not assumed. The portal channel is the initial path; API/bulk adapters need bank-by-bank onboarding.' $blue 13 9
  Add-Card $s 492 143 420 101 'What is the legal basis for lien?' 'The prototype does not adjudicate legal authority. AICTE must validate the mandate, rules and prescribed format.' $saffron 13 9
  Add-Card $s 48 262 420 101 'Can forgery detection prove fraud?' 'No. OCR/QR/consistency checks raise explainable flags; independent bank confirmation is required.' $teal 13 9
  Add-Card $s 492 262 420 101 'Will it scale?' 'The prototype stack is deliberately small. Production needs migration, storage, queue, security and performance work.' $green 13 9
  Add-Card $s 48 381 420 101 'How is privacy protected?' 'Use minimum necessary data, role/scope controls and audit; demo data is synthetic. Production governance remains required.' $blue 13 9
  Add-Card $s 492 381 420 101 'Can it run in government hosting?' 'Designed without mandatory SaaS; deployment, data residency, secrets and KMS/HSM need production hardening.' $saffron 13 9

  # 14 — Demo run sheet
  $s = New-Slide
  Add-Header $s '13 / Presenter run sheet' 'A 7-minute planned route through the six test scenarios.' 'Planned timings only—not measured demo duration. Use reset seed state; keep a recording as fallback.' 'Source: SRS §9.1; 4-Day Plan §§1.1, 4'
  $run = @(
    @{ y = 146; time = '0:00–1:20'; title = 'New FDR submission'; story = 'G1–G2 / S1; show claimed fields and review.' },
    @{ y = 201; time = '1:20–2:20'; title = 'Discrepancy + verification'; story = 'G3–G5, G8 / S2, S6; show flags, bank check, SoD.' },
    @{ y = 256; time = '2:20–3:15'; title = 'Validity + renewal'; story = 'G7 / S3–S5; advance demo clock, alert, renew.' },
    @{ y = 311; time = '3:15–4:30'; title = 'Release eligibility'; story = 'G9 / S7; show hold, remedy, recommendation.' },
    @{ y = 366; time = '4:30–5:55'; title = 'Letter + execution'; story = 'G10–G11 / S7–S8; sign, QR verify, bank acknowledgement.' },
    @{ y = 421; time = '5:55–7:00'; title = 'Settlement + audit'; story = 'G12; confirm AICTE share and verify audit chain.' }
  )
  foreach ($item in $run) {
    Add-Box $s 48 $item.y 864 45 $white $line | Out-Null
    Add-Text $s $item.time 61 ($item.y + 12) 105 17 10 $blue $true | Out-Null
    Add-Text $s $item.title 178 ($item.y + 10) 205 21 11 $navy $true | Out-Null
    Add-Text $s $item.story 392 ($item.y + 11) 500 20 9 $ink $false | Out-Null
  }
  Add-Text $s 'Fallback: if an API/demo step fails, show the recorded seeded run and label it as a recording.' 48 476 860 18 9 $red $true | Out-Null

  # 15 — Close
  $s = New-Slide $navy
  Add-Box $s 0 0 960 9 $saffron $saffron 1 | Out-Null
  Add-Text $s 'SAKSHYA' 62 48 500 30 16 $white $true | Out-Null
  Add-Text $s 'From a claim to a verifiable chain of evidence.' 62 148 820 82 30 $white $true | Out-Null
  Add-Text $s 'Submit  →  Confirm  →  Monitor  →  Release  →  Verify  →  Settle' 64 263 820 40 16 (Rgb 206 221 237) $false | Out-Null
  Add-Box $s 64 346 830 1 (Rgb 65 89 118) (Rgb 65 89 118) 1 | Out-Null
  Add-Text $s 'Sakshya  /  Evidence before action.' 64 380 700 30 16 $saffron $true | Out-Null
  Add-Text $s 'Prototype v1.0  •  SIH 2026  •  Synthetic data  •  Integration status varies by module' 64 446 815 24 10 (Rgb 177 195 215) $false | Out-Null
  Add-Text $s '15' 874 510 35 16 8 (Rgb 168 187 208) $true | Out-Null

  $presentation.SaveAs($pptxPath, 24)
  $presentation.SaveAs($pdfPath, 32)
  Start-Sleep -Seconds 1
  Write-Output "Created $pptxPath"
  Write-Output "Created $pdfPath"
  Write-Output "Slides: $($presentation.Slides.Count)"
} finally {
  if ($presentation) {
    try { $presentation.Close() } catch { Write-Warning "Could not close the PowerPoint presentation cleanly: $($_.Exception.Message)" }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) } catch { Write-Warning "Could not release the presentation COM object: $($_.Exception.Message)" }
  }
  if ($powerPoint) {
    try { $powerPoint.Quit() } catch { Write-Warning "Could not quit PowerPoint cleanly: $($_.Exception.Message)" }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) } catch { Write-Warning "Could not release the PowerPoint COM object: $($_.Exception.Message)" }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
