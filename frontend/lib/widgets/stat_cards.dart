import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models/analysis_result.dart';
import '../theme/app_theme.dart';

class StatCardsRow extends StatelessWidget {
  final AnalysisResult result;

  const StatCardsRow({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final cards = [
      _StatCardData(
        icon: Icons.security_rounded,
        iconColor: AppColors.danger,
        label: 'Security Alerts',
        value: result.securityAlerts.length,
        subtitle: _criticalCount(result.securityAlerts),
      ),
      _StatCardData(
        icon: Icons.bug_report_rounded,
        iconColor: AppColors.warning,
        label: 'Bugs',
        value: result.bugCount,
        subtitle: '${result.bugCount} async issue${result.bugCount != 1 ? 's' : ''}',
      ),
      _StatCardData(
        icon: Icons.code_off_rounded,
        iconColor: AppColors.info,
        label: 'Code Smells',
        value: result.codeSmellCount,
        subtitle: '${result.codeSmellCount} file${result.codeSmellCount != 1 ? 's' : ''} untested',
      ),
      _StatCardData(
        icon: Icons.edit_document,
        iconColor: AppColors.success,
        label: 'Files Changed',
        value: result.pr.filesChanged,
        subtitle: '+${result.pr.additions} / -${result.pr.deletions}',
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        // Responsive: 2-col on narrow, 4-col on wide
        final narrow = constraints.maxWidth < 600;
        final crossAxisCount = narrow ? 2 : 4;
        // Give mobile cards more vertical room so text never clips
        final aspectRatio = narrow ? 1.35 : 1.6;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cards.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: aspectRatio,
          ),
          itemBuilder: (context, i) => _StatCard(data: cards[i])
              .animate(delay: Duration(milliseconds: 100 * i))
              .fadeIn(duration: 400.ms)
              .slideY(begin: 0.15, end: 0),
        );
      },
    );
  }

  String _criticalCount(List<SecurityAlert> alerts) {
    final critical = alerts.where((a) => a.severity == 'critical').length;
    if (critical == 0) return 'No critical issues';
    return '$critical critical';
  }
}

class _StatCardData {
  final IconData icon;
  final Color iconColor;
  final String label;
  final int value;
  final String subtitle;

  const _StatCardData({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.subtitle,
  });
}

class _StatCard extends StatelessWidget {
  final _StatCardData data;
  const _StatCard({required this.data});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: data.iconColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(data.icon, color: data.iconColor, size: 18),
                ),
                Text(
                  '${data.value}',
                  style: TextStyle(
                    color: data.value > 0 ? data.iconColor : AppColors.success,
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              data.label,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              data.subtitle,
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
