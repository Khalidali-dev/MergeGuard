// Strongly-typed models for the MergeGuard PR analysis API response.
// The canonical result type is [PRAnalysisResult].
// [AnalysisResult] is kept as a typedef for backwards compatibility.

// ── SecurityAlert ────────────────────────────────────────────────────────────
class SecurityAlert {
  final String type;
  final String ruleId;
  final String severity;
  final String file;
  final int? line;
  final String label;
  final String? snippet;
  final String fix;

  const SecurityAlert({
    required this.type,
    required this.ruleId,
    required this.severity,
    required this.file,
    this.line,
    required this.label,
    this.snippet,
    required this.fix,
  });

  factory SecurityAlert.fromJson(Map<String, dynamic> json) => SecurityAlert(
        type: (json['type'] as String?) ?? 'secret',
        ruleId: (json['ruleId'] as String?) ?? '',
        severity: (json['severity'] as String?) ?? 'low',
        file: (json['file'] as String?) ?? '',
        line: json['line'] as int?,
        label: (json['label'] as String?) ?? '',
        snippet: json['snippet'] as String?,
        fix: (json['fix'] as String?) ?? '',
      );
}

// ── CodeIssue ─────────────────────────────────────────────────────────────────
class CodeIssue {
  final String type;
  final String ruleId;
  final String severity;
  final String file;
  final int? line;
  final String label;
  final String? snippet;
  final String fix;

  const CodeIssue({
    required this.type,
    required this.ruleId,
    required this.severity,
    required this.file,
    this.line,
    required this.label,
    this.snippet,
    required this.fix,
  });

  factory CodeIssue.fromJson(Map<String, dynamic> json) => CodeIssue(
        type: (json['type'] as String?) ?? 'async',
        ruleId: (json['ruleId'] as String?) ?? '',
        severity: (json['severity'] as String?) ?? 'low',
        file: (json['file'] as String?) ?? '',
        line: json['line'] as int?,
        label: (json['label'] as String?) ?? '',
        snippet: json['snippet'] as String?,
        fix: (json['fix'] as String?) ?? '',
      );
}

// ── RecommendedFix ────────────────────────────────────────────────────────────
class RecommendedFix {
  final String priority;
  final String category;
  final String file;
  final int? line;
  final String description;

  const RecommendedFix({
    required this.priority,
    required this.category,
    required this.file,
    this.line,
    required this.description,
  });

  factory RecommendedFix.fromJson(Map<String, dynamic> json) => RecommendedFix(
        priority: (json['priority'] as String?) ?? 'low',
        category: (json['category'] as String?) ?? '',
        file: (json['file'] as String?) ?? '',
        line: json['line'] as int?,
        description: (json['description'] as String?) ?? '',
      );
}

// ── PrInfo ────────────────────────────────────────────────────────────────────
class PrInfo {
  final int number;
  final String title;
  final String? author;
  final String state;
  final String url;
  final int filesChanged;
  final int additions;
  final int deletions;

  const PrInfo({
    required this.number,
    required this.title,
    this.author,
    required this.state,
    required this.url,
    required this.filesChanged,
    required this.additions,
    required this.deletions,
  });

  factory PrInfo.fromJson(Map<String, dynamic> json) => PrInfo(
        number: (json['number'] as int?) ?? 0,
        title: (json['title'] as String?) ?? '',
        author: json['author'] as String?,
        state: (json['state'] as String?) ?? 'open',
        url: (json['url'] as String?) ?? '',
        filesChanged: (json['filesChanged'] as int?) ?? 0,
        additions: (json['additions'] as int?) ?? 0,
        deletions: (json['deletions'] as int?) ?? 0,
      );
}

// ── PRAnalysisResult (canonical) ──────────────────────────────────────────────
class PRAnalysisResult {
  final int healthScore;
  final String summary;
  final PrInfo pr;
  final List<SecurityAlert> securityAlerts;
  final List<CodeIssue> codeIssues;
  final List<RecommendedFix> recommendedFixes;

  const PRAnalysisResult({
    required this.healthScore,
    required this.summary,
    required this.pr,
    required this.securityAlerts,
    required this.codeIssues,
    required this.recommendedFixes,
  });

  // ── Derived counts ────────────────────────────────────────────────────────
  int get bugCount => codeIssues.where((i) => i.type == 'async').length;
  int get codeSmellCount => codeIssues.where((i) => i.type == 'test').length;
  int get totalIssues => securityAlerts.length + codeIssues.length;

  bool get hasIssues => totalIssues > 0;
  bool get hasCritical =>
      securityAlerts.any((a) => a.severity == 'critical');

  String get scoreGrade {
    if (healthScore >= 90) return 'Excellent';
    if (healthScore >= 75) return 'Good';
    if (healthScore >= 50) return 'Fair';
    if (healthScore >= 25) return 'Poor';
    return 'Critical';
  }

  // ── Deserialization ───────────────────────────────────────────────────────
  factory PRAnalysisResult.fromJson(Map<String, dynamic> json) {
    // Accept both { data: {...} } envelope and bare object
    final data = json.containsKey('data')
        ? json['data'] as Map<String, dynamic>
        : json;

    return PRAnalysisResult(
      healthScore: (data['healthScore'] as int?) ?? 0,
      summary: (data['summary'] as String?) ?? '',
      pr: PrInfo.fromJson(data['pr'] as Map<String, dynamic>),
      securityAlerts: ((data['securityAlerts'] as List?) ?? [])
          .map((e) => SecurityAlert.fromJson(e as Map<String, dynamic>))
          .toList(),
      codeIssues: ((data['codeIssues'] as List?) ?? [])
          .map((e) => CodeIssue.fromJson(e as Map<String, dynamic>))
          .toList(),
      recommendedFixes: ((data['recommendedFixes'] as List?) ?? [])
          .map((e) => RecommendedFix.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Backwards-compatible alias.
typedef AnalysisResult = PRAnalysisResult;
