import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../models/analysis_result.dart';
import '../providers/analysis_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/error_dialog.dart';
import '../widgets/health_score_gauge.dart';
import '../widgets/issues_list.dart';
import '../widgets/loading_skeleton.dart';
import '../widgets/pr_info_bar.dart';
import '../widgets/search_bar_widget.dart' show PrSearchBar;
import '../widgets/stat_cards.dart';

// ── Responsive breakpoints ────────────────────────────────────────────────────
class _Breakpoint {
  static const double mobile  = 600;
  static const double tablet  = 1024;
  // desktop: > tablet
}

enum _Layout { mobile, tablet, desktop }

_Layout _layoutOf(double width) {
  if (width < _Breakpoint.mobile) return _Layout.mobile;
  if (width < _Breakpoint.tablet) return _Layout.tablet;
  return _Layout.desktop;
}

// ── Root screen ───────────────────────────────────────────────────────────────
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(),
          const Expanded(child: _DashboardBody()),
        ],
      ),
    );
  }
}

// ── Top navigation bar ────────────────────────────────────────────────────────
class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final layout = _layoutOf(width);

    return Container(
      height: 56,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      padding: EdgeInsets.symmetric(
        horizontal: layout == _Layout.mobile ? 16 : 24,
      ),
      child: Row(
        children: [
          // Logo mark
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.accent,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Icon(Icons.merge_type_rounded,
                color: AppColors.background, size: 16),
          ),
          const SizedBox(width: 10),
          const Text(
            'MergeGuard',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.accent.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: const Text(
              'beta',
              style: TextStyle(
                color: AppColors.accent,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const Spacer(),
          if (layout != _Layout.mobile)
            const Text(
              'AI-powered PR Analysis',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
        ],
      ),
    );
  }
}

// ── Dashboard body ────────────────────────────────────────────────────────────
class _DashboardBody extends StatefulWidget {
  const _DashboardBody();

  @override
  State<_DashboardBody> createState() => _DashboardBodyState();
}

class _DashboardBodyState extends State<_DashboardBody> {
  @override
  Widget build(BuildContext context) {
    return Consumer<AnalysisProvider>(
      builder: (context, provider, _) {
        // Show error dialog once per new error (post-frame to avoid
        // calling showDialog during build).
        if (provider.hasUnseenError) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) ErrorDialog.show(context, provider);
          });
        }

        final width = MediaQuery.sizeOf(context).width;
        final layout = _layoutOf(width);

        final hPad = switch (layout) {
          _Layout.mobile  => 16.0,
          _Layout.tablet  => 24.0,
          _Layout.desktop => 32.0,
        };

        return SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: hPad, vertical: 24),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: layout == _Layout.desktop ? 1200 : double.infinity,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Search bar ─────────────────────────────────────────
                  PrSearchBar(
                    isLoading: provider.state == AnalysisState.loading,
                    onAnalyze: (url) =>
                        context.read<AnalysisProvider>().analyze(url),
                  ),

                  // ── Loading skeleton ───────────────────────────────────
                  if (provider.state == AnalysisState.loading) ...[
                    const SizedBox(height: 24),
                    const LoadingSkeleton(),
                  ],

                  // ── Idle hint ──────────────────────────────────────────
                  if (provider.state == AnalysisState.idle) ...[
                    const SizedBox(height: 64),
                    const _IdleHint(),
                  ],

                  // ── Error inline banner (backup beneath dialog) ────────
                  if (provider.state == AnalysisState.error &&
                      provider.error != null) ...[
                    const SizedBox(height: 16),
                    _ErrorBanner(
                      error: provider.error!,
                      onRetry: () {},
                    ),
                  ],

                  // ── Results ────────────────────────────────────────────
                  if (provider.state == AnalysisState.success &&
                      provider.result != null) ...[
                    const SizedBox(height: 24),
                    _ResultsSection(
                      result: provider.result!,
                      layout: layout,
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// ── Results section ───────────────────────────────────────────────────────────
class _ResultsSection extends StatelessWidget {
  final PRAnalysisResult result;
  final _Layout layout;

  const _ResultsSection({required this.result, required this.layout});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── PR meta bar ──────────────────────────────────────────────────────
        PrInfoBar(pr: result.pr),
        const SizedBox(height: 12),

        // ── AI summary ───────────────────────────────────────────────────────
        _SummaryCard(summary: result.summary),
        const SizedBox(height: 28),

        // ── Health score + stat cards ────────────────────────────────────────
        _SectionLabel(
          icon: Icons.monitor_heart_outlined,
          title: 'Code Health',
          delay: 0,
        ),
        const SizedBox(height: 12),
        _GaugeAndCards(result: result, layout: layout),
        const SizedBox(height: 28),

        // ── Issues & fixes ───────────────────────────────────────────────────
        _SectionLabel(
          icon: Icons.rule_folder_outlined,
          title: 'Issues & AI Suggested Fixes',
          badge: result.totalIssues,
          delay: 100,
        ),
        const SizedBox(height: 12),
        IssuesList(result: result),
        const SizedBox(height: 56),
      ],
    );
  }
}

// ── Section label with accent bar ────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final IconData icon;
  final String title;
  final int? badge;
  final int delay;

  const _SectionLabel({
    required this.icon,
    required this.title,
    this.badge,
    this.delay = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Accent bar
        Container(
          width: 3,
          height: 18,
          decoration: BoxDecoration(
            color: AppColors.accent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        Icon(icon, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 7),
        Text(
          title,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
          ),
        ),
        if (badge != null && badge! > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              '$badge',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ],
    )
        .animate(delay: Duration(milliseconds: delay))
        .fadeIn(duration: 350.ms)
        .slideX(begin: -0.03, end: 0);
  }
}

// ── Gauge + stat cards layout ─────────────────────────────────────────────────
class _GaugeAndCards extends StatelessWidget {
  final PRAnalysisResult result;
  final _Layout layout;

  const _GaugeAndCards({required this.result, required this.layout});

  @override
  Widget build(BuildContext context) {
    // Mobile: stack gauge above cards
    if (layout == _Layout.mobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HealthScoreGauge(score: result.healthScore),
          const SizedBox(height: 12),
          StatCardsRow(result: result),
        ],
      );
    }

    // Tablet / desktop: gauge on the left, cards fill the rest.
    // Use a Row with a fixed-width gauge and Expanded cards.
    // Wrap gauge in an Align so it doesn't stretch unnaturally taller
    // than the cards grid.
    final gaugeWidth = layout == _Layout.desktop ? 240.0 : 210.0;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: gaugeWidth,
          child: HealthScoreGauge(score: result.healthScore),
        ),
        const SizedBox(width: 16),
        Expanded(child: StatCardsRow(result: result)),
      ],
    );
  }
}

// ── Summary card ──────────────────────────────────────────────────────────────
class _SummaryCard extends StatelessWidget {
  final String summary;
  const _SummaryCard({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(Icons.summarize_outlined,
                  color: AppColors.accent, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                summary,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                  height: 1.55,
                ),
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 400.ms);
  }
}

// ── Error inline banner ───────────────────────────────────────────────────────
class _ErrorBanner extends StatelessWidget {
  final ApiException error;
  final VoidCallback onRetry;

  const _ErrorBanner({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: AppColors.danger, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              error.message,
              style: const TextStyle(color: AppColors.danger, fontSize: 13),
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 300.ms)
        .shake(hz: 2, offset: const Offset(4, 0));
  }
}

// ── Idle hint ─────────────────────────────────────────────────────────────────
class _IdleHint extends StatelessWidget {
  const _IdleHint();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.border),
            ),
            child: const Icon(Icons.radar_rounded,
                color: AppColors.accent, size: 36),
          ),
          const SizedBox(height: 20),
          const Text(
            'Enter a GitHub PR URL above to begin analysis',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'MergeGuard scans for secrets, async bugs, and missing tests',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          // Feature chips
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: const [
              _FeatureChip(icon: Icons.shield_outlined,
                  label: 'Secret Detection'),
              _FeatureChip(icon: Icons.bug_report_outlined,
                  label: 'Async Bug Scan'),
              _FeatureChip(icon: Icons.science_outlined,
                  label: 'Test Coverage'),
              _FeatureChip(icon: Icons.auto_fix_high_rounded,
                  label: 'AI Fix Suggestions'),
            ],
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 600.ms)
        .scale(begin: const Offset(0.96, 0.96), end: const Offset(1, 1));
  }
}

class _FeatureChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeatureChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.textMuted),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
