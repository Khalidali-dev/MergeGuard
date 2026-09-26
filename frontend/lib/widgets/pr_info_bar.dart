import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models/analysis_result.dart';
import '../theme/app_theme.dart';

class PrInfoBar extends StatelessWidget {
  final PrInfo pr;

  const PrInfoBar({super.key, required this.pr});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final narrow = constraints.maxWidth < 600;

            final prBadge = _PrBadge(number: pr.number);
            final title = _PrTitle(title: pr.title);
            final chips = _MetaChipsRow(pr: pr);

            if (narrow) {
              // Stack: badge+title on first row, chips on second
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      prBadge,
                      const SizedBox(width: 10),
                      Expanded(child: title),
                      const SizedBox(width: 8),
                      _StateBadge(state: pr.state),
                    ],
                  ),
                  const SizedBox(height: 10),
                  chips,
                ],
              );
            }

            // Wide layout: all in one row
            return Row(
              children: [
                prBadge,
                const SizedBox(width: 12),
                Expanded(child: title),
                const SizedBox(width: 16),
                chips,
                const SizedBox(width: 8),
                _StateBadge(state: pr.state),
              ],
            );
          },
        ),
      ),
    ).animate().fadeIn(duration: 400.ms);
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _PrBadge extends StatelessWidget {
  final int number;
  const _PrBadge({required this.number});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.3)),
      ),
      child: Text(
        '#$number',
        style: const TextStyle(
          color: AppColors.accent,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _PrTitle extends StatelessWidget {
  final String title;
  const _PrTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: AppColors.textPrimary,
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      overflow: TextOverflow.ellipsis,
      maxLines: 1,
    );
  }
}

class _MetaChipsRow extends StatelessWidget {
  final PrInfo pr;
  const _MetaChipsRow({required this.pr});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _MetaChip(
          icon: Icons.person_outline_rounded,
          label: pr.author ?? 'unknown',
        ),
        _MetaChip(
          icon: Icons.insert_drive_file_outlined,
          label: '${pr.filesChanged} files',
        ),
        _MetaChip(
          icon: Icons.add_circle_outline_rounded,
          label: '+${pr.additions}',
          color: AppColors.success,
        ),
        _MetaChip(
          icon: Icons.remove_circle_outline_rounded,
          label: '-${pr.deletions}',
          color: AppColors.danger,
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _MetaChip({
    required this.icon,
    required this.label,
    this.color = AppColors.textSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}

class _StateBadge extends StatelessWidget {
  final String state;
  const _StateBadge({required this.state});

  @override
  Widget build(BuildContext context) {
    final isOpen = state == 'open';
    final color = isOpen ? AppColors.success : AppColors.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            state,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
