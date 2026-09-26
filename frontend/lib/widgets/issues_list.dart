import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models/analysis_result.dart';
import '../theme/app_theme.dart';

// ── Unified finding type ──────────────────────────────────────────────────────
class _Finding {
  final String category; // 'security' | 'async' | 'test'
  final String severity;
  final String file;
  final int? line;
  final String label;
  final String? snippet;
  final String fix;

  const _Finding({
    required this.category,
    required this.severity,
    required this.file,
    this.line,
    required this.label,
    this.snippet,
    required this.fix,
  });
}

// ── Main widget ───────────────────────────────────────────────────────────────
class IssuesList extends StatelessWidget {
  final AnalysisResult result;

  const IssuesList({super.key, required this.result});

  List<_Finding> get _findings {
    final all = <_Finding>[];

    for (final a in result.securityAlerts) {
      all.add(_Finding(
        category: 'security',
        severity: a.severity,
        file: a.file,
        line: a.line,
        label: a.label,
        snippet: a.snippet,
        fix: a.fix,
      ));
    }
    for (final i in result.codeIssues) {
      all.add(_Finding(
        category: i.type,
        severity: i.severity,
        file: i.file,
        line: i.line,
        label: i.label,
        snippet: i.snippet,
        fix: i.fix,
      ));
    }

    // Sort by severity
    const order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3};
    all.sort((a, b) =>
        (order[a.severity] ?? 4).compareTo(order[b.severity] ?? 4));
    return all;
  }

  @override
  Widget build(BuildContext context) {
    final findings = _findings;

    if (findings.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle_rounded,
                  color: AppColors.success, size: 20),
              const SizedBox(width: 12),
              const Text(
                'No issues found — this PR looks great!',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }

    // Section header is provided by the parent (_SectionLabel in dashboard_screen).
    // IssuesList renders only the list cards.
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: findings.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, i) => _FindingCard(finding: findings[i])
          .animate(delay: Duration(milliseconds: 60 * i))
          .fadeIn(duration: 350.ms)
          .slideX(begin: 0.04, end: 0),
    );
  }
}

// ── Individual finding card ───────────────────────────────────────────────────
class _FindingCard extends StatefulWidget {
  final _Finding finding;
  const _FindingCard({required this.finding});

  @override
  State<_FindingCard> createState() => _FindingCardState();
}

class _FindingCardState extends State<_FindingCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final f = widget.finding;
    final severityColor = _severityColor(f.severity);
    final categoryIcon = _categoryIcon(f.category);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header row ──
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  // Severity stripe
                  Container(
                    width: 3,
                    height: 36,
                    decoration: BoxDecoration(
                      color: severityColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Category icon
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: severityColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(categoryIcon, color: severityColor, size: 15),
                  ),
                  const SizedBox(width: 12),

                  // Label + file
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          f.label,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(Icons.insert_drive_file_outlined,
                                size: 11, color: AppColors.textMuted),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                f.line != null
                                    ? '${f.file}:${f.line}'
                                    : f.file,
                                style: monoStyle(size: 11),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Severity badge
                  _SeverityBadge(severity: f.severity),
                  const SizedBox(width: 8),

                  // Expand toggle
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: AppColors.textMuted,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),

          // ── Expanded body: before/after ──
          if (_expanded)
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeInOut,
              child: Container(
                width: double.infinity,
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AppColors.border),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Before (snippet)
                    if (f.snippet != null && f.snippet!.isNotEmpty) ...[
                      _CodeBlock(
                        label: 'Current Code',
                        labelColor: AppColors.danger,
                        icon: Icons.close_rounded,
                        code: f.snippet!,
                        backgroundColor: AppColors.danger.withValues(alpha: 0.05),
                        borderColor: AppColors.danger.withValues(alpha: 0.2),
                      ),
                      const Divider(height: 1),
                    ],

                    // After (fix suggestion)
                    _FixBlock(fix: f.fix, severity: f.severity),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color _severityColor(String severity) {
    switch (severity) {
      case 'critical':
        return AppColors.critical;
      case 'high':
        return AppColors.high;
      case 'medium':
        return AppColors.medium;
      default:
        return AppColors.low;
    }
  }

  IconData _categoryIcon(String category) {
    switch (category) {
      case 'security':
        return Icons.shield_outlined;
      case 'async':
        return Icons.bug_report_outlined;
      case 'test':
        return Icons.science_outlined;
      default:
        return Icons.warning_amber_rounded;
    }
  }
}

// ── Code block (before) ───────────────────────────────────────────────────────
class _CodeBlock extends StatelessWidget {
  final String label;
  final Color labelColor;
  final IconData icon;
  final String code;
  final Color backgroundColor;
  final Color borderColor;

  const _CodeBlock({
    required this.label,
    required this.labelColor,
    required this.icon,
    required this.code,
    required this.backgroundColor,
    required this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: backgroundColor,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: labelColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: labelColor,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: borderColor),
            ),
            child: Text(code, style: monoStyle(size: 12)),
          ),
        ],
      ),
    );
  }
}

// ── Fix suggestion block (after) ─────────────────────────────────────────────
class _FixBlock extends StatefulWidget {
  final String fix;
  final String severity;

  const _FixBlock({required this.fix, required this.severity});

  @override
  State<_FixBlock> createState() => _FixBlockState();
}

class _FixBlockState extends State<_FixBlock> {
  bool _copied = false;

  void _copy() {
    Clipboard.setData(ClipboardData(text: widget.fix));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2),
        () => mounted ? setState(() => _copied = false) : null);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.success.withValues(alpha: 0.05),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_fix_high_rounded,
                      size: 13, color: AppColors.success),
                  const SizedBox(width: 6),
                  const Text(
                    'AI Suggested Fix',
                    style: TextStyle(
                      color: AppColors.success,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              // Copy button
              InkWell(
                onTap: _copy,
                borderRadius: BorderRadius.circular(4),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Row(
                    children: [
                      Icon(
                        _copied ? Icons.check_rounded : Icons.copy_rounded,
                        size: 12,
                        color: _copied
                            ? AppColors.success
                            : AppColors.textMuted,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _copied ? 'Copied!' : 'Copy',
                        style: TextStyle(
                          color: _copied
                              ? AppColors.success
                              : AppColors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                  color: AppColors.success.withValues(alpha: 0.25)),
            ),
            child: Text(
              widget.fix,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
class _SeverityBadge extends StatelessWidget {
  final String severity;
  const _SeverityBadge({required this.severity});

  @override
  Widget build(BuildContext context) {
    final color = switch (severity) {
      'critical' => AppColors.critical,
      'high' => AppColors.high,
      'medium' => AppColors.medium,
      _ => AppColors.low,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        severity.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

