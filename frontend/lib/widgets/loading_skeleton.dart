import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_theme.dart';

/// Pulsing placeholder skeleton shown while analysis is loading.
class LoadingSkeleton extends StatelessWidget {
  const LoadingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // PR info bar skeleton
        _SkeletonBox(height: 52, borderRadius: 12)
            .animate(onPlay: (c) => c.repeat())
            .shimmer(
              duration: 1400.ms,
              color: AppColors.surfaceAlt,
            ),
        const SizedBox(height: 16),

        // Summary skeleton
        _SkeletonBox(height: 48, borderRadius: 12)
            .animate(onPlay: (c) => c.repeat())
            .shimmer(
              duration: 1400.ms,
              delay: 100.ms,
              color: AppColors.surfaceAlt,
            ),
        const SizedBox(height: 20),

        // Gauge + cards row skeleton
        LayoutBuilder(builder: (context, constraints) {
          final wide = constraints.maxWidth > 700;
          if (wide) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SkeletonBox(width: 220, height: 220, borderRadius: 12)
                    .animate(onPlay: (c) => c.repeat())
                    .shimmer(
                        duration: 1400.ms,
                        delay: 150.ms,
                        color: AppColors.surfaceAlt),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    children: [
                      Row(
                        children: List.generate(
                          4,
                          (i) => Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(left: i == 0 ? 0 : 12),
                              child: _SkeletonBox(height: 100, borderRadius: 12)
                                  .animate(onPlay: (c) => c.repeat())
                                  .shimmer(
                                      duration: 1400.ms,
                                      delay: Duration(milliseconds: 150 + 80 * i),
                                      color: AppColors.surfaceAlt),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          }
          return Column(
            children: [
              _SkeletonBox(height: 200, borderRadius: 12)
                  .animate(onPlay: (c) => c.repeat())
                  .shimmer(
                      duration: 1400.ms,
                      delay: 150.ms,
                      color: AppColors.surfaceAlt),
              const SizedBox(height: 12),
              ...List.generate(
                2,
                (i) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _SkeletonBox(height: 90, borderRadius: 12)
                      .animate(onPlay: (c) => c.repeat())
                      .shimmer(
                          duration: 1400.ms,
                          delay: Duration(milliseconds: 200 + 80 * i),
                          color: AppColors.surfaceAlt),
                ),
              ),
            ],
          );
        }),

        const SizedBox(height: 20),

        // Issue cards skeleton
        ...List.generate(
          3,
          (i) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _SkeletonBox(height: 64, borderRadius: 12)
                .animate(onPlay: (c) => c.repeat())
                .shimmer(
                    duration: 1400.ms,
                    delay: Duration(milliseconds: 300 + 100 * i),
                    color: AppColors.surfaceAlt),
          ),
        ),
      ],
    ).animate().fadeIn(duration: 300.ms);
  }
}

class _SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double borderRadius;

  const _SkeletonBox({
    this.width,
    required this.height,
    required this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width ?? double.infinity,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: AppColors.border),
      ),
    );
  }
}
