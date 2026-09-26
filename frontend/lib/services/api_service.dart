import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../models/analysis_result.dart';

// ── Typed API exception ───────────────────────────────────────────────────────

/// Categorised error thrown by [ApiService].
enum ApiErrorKind {
  validation,   // 400 — bad input
  auth,         // 401/403 — auth / rate-limit
  notFound,     // 404 — PR not found
  timeout,      // connect / receive timeout
  noConnection, // cannot reach the server
  server,       // 5xx / unexpected
}

class ApiException implements Exception {
  final ApiErrorKind kind;
  final String message;
  final int? statusCode;

  const ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  @override
  String toString() => message;
}

// ── ApiService ────────────────────────────────────────────────────────────────

/// Singleton service that communicates with the MergeGuard backend.
///
/// Base URL configuration:
/// - In development: defaults to `http://localhost:5001`
/// - In production web: defaults to `''` (relative `/api/analyze-pr`)
/// - In custom deployments: pass `--dart-define=API_BASE_URL=https://...`
/// Endpoint: POST /api/analyze-pr
class ApiService {
  ApiService._() {
    _dio = _buildDio();
  }

  static final ApiService instance = ApiService._();

  static const String _defaultDevUrl = 'http://localhost:5001';
  static const String _envBaseUrl = String.fromEnvironment('API_BASE_URL');
  static String? _overrideBaseUrl;

  /// Dynamic Base URL:
  /// 1. Uses runtime override if set via [setBaseUrl]
  /// 2. Uses `--dart-define=API_BASE_URL=...` if provided at build time
  /// 3. In Web Release mode, defaults to empty string `''` (relative `/api/...`)
  /// 4. Defaults to `http://localhost:5001` for local development
  static String get baseUrl {
    if (_overrideBaseUrl != null) return _overrideBaseUrl!;
    if (_envBaseUrl.isNotEmpty) return _envBaseUrl;
    if (kReleaseMode && kIsWeb) {
      return '';
    }
    return _defaultDevUrl;
  }

  /// Readable target name for timeout / connection error reporting.
  static String get displayBaseUrl =>
      baseUrl.isEmpty ? 'current host (/api)' : baseUrl;

  /// Override the API URL at runtime (e.g., custom backend URL or testing).
  static void setBaseUrl(String url) {
    _overrideBaseUrl = url;
    instance._dio.options.baseUrl = url;
  }

  /// Maximum number of retries for transient network errors (not 4xx).
  static const int _maxRetries = 2;

  late final Dio _dio;

  Dio _buildDio() {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Request / response logger in debug builds
    assert(() {
      dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          // ignore: avoid_print
          logPrint: (o) => print('[ApiService] $o'),
        ),
      );
      return true;
    }());

    return dio;
  }

  /// Analyse a GitHub PR by URL.
  ///
  /// Returns a fully parsed [PRAnalysisResult].
  /// Throws an [ApiException] on any failure.
  Future<PRAnalysisResult> analyzePr(String prUrl) async {
    int attempt = 0;

    while (true) {
      try {
        final response = await _dio.post<Map<String, dynamic>>(
          '/api/analyze-pr',
          data: {'prUrl': prUrl},
        );

        final body = response.data;
        if (body == null || body['success'] != true) {
          throw ApiException(
            kind: ApiErrorKind.server,
            message: 'Unexpected response from server.',
            statusCode: response.statusCode,
          );
        }

        return PRAnalysisResult.fromJson(body);
      } on DioException catch (e) {
        final apiEx = _mapDioError(e);

        // Only retry on connection/timeout errors, not client errors
        final isRetryable = apiEx.kind == ApiErrorKind.timeout ||
            apiEx.kind == ApiErrorKind.noConnection;

        if (isRetryable && attempt < _maxRetries) {
          attempt++;
          // Exponential back-off: 500ms, 1000ms
          await Future.delayed(Duration(milliseconds: 500 * attempt));
          continue;
        }

        throw apiEx;
      }
    }
  }

  /// Maps a [DioException] to a typed [ApiException].
  ApiException _mapDioError(DioException e) {
    // HTTP error responses
    if (e.response != null) {
      final status = e.response!.statusCode ?? 0;
      final data = e.response!.data;

      String message;
      if (data is Map && data['error'] != null) {
        final details = data['details'];
        message = (details is List && details.isNotEmpty)
            ? details.first.toString()
            : data['error'].toString();
      } else {
        message = _httpStatusMessage(status);
      }

      final kind = switch (status) {
        400 => ApiErrorKind.validation,
        401 || 403 => ApiErrorKind.auth,
        404 => ApiErrorKind.notFound,
        >= 500 => ApiErrorKind.server,
        _ => ApiErrorKind.server,
      };

      return ApiException(kind: kind, message: message, statusCode: status);
    }

    // Network-level errors
    return switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        ApiException(
          kind: ApiErrorKind.timeout,
          message:
              'Request timed out. Is the backend running at $displayBaseUrl?',
        ),
      DioExceptionType.connectionError => ApiException(
          kind: ApiErrorKind.noConnection,
          message:
              'Cannot reach the backend at $displayBaseUrl. '
              'Make sure the server is running.',
        ),
      _ => ApiException(
          kind: ApiErrorKind.server,
          message: 'Network error: ${e.message ?? 'unknown'}',
        ),
    };
  }

  String _httpStatusMessage(int status) => switch (status) {
        400 => 'Invalid request. Check the PR URL format.',
        401 => 'GitHub authentication failed. Provide a valid GITHUB_TOKEN.',
        403 =>
          'GitHub rate limit exceeded or access denied. '
              'Add a GITHUB_TOKEN with appropriate scopes.',
        404 => 'PR not found. Verify the URL and repository access.',
        422 => 'GitHub rejected the request. The PR URL may be invalid.',
        502 => 'Backend received an error from GitHub.',
        _ => 'Server error ($status).',
      };

  /// Release Dio resources. Call when the service is no longer needed.
  void dispose() => _dio.close(force: true);
}
