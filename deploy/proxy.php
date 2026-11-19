<?php
/**
 * 同源 Supabase 代理。
 * 参考 lost-found 项目的 proxy.php 模式：
 *   bridge.html -> proxy.php?path=/rest/v1/... -> Supabase
 *
 * 与参考实现的区别：
 * - 参考实现固定用 anon key，适合匿名 RPC；
 * - 本项目需要 auth.uid()，所以优先转发客户端用户 JWT；
 * - 如果没有用户 JWT，才回退到 anon key。
 *
 * 上传到：
 * https://dornhub.eu.org/.private/check-in/proxy.php
 */

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey, X-User-Token, Prefer, Accept');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const SUPABASE_URL = 'https://hisewqjyxadmezeiwnzc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yedDW1qzLL3nsZySIugLNw_-r4FRFU_';

$path = (string) ($_GET['path'] ?? '');
if ($path === '') {
    http_response_code(400);
    echo json_encode(['error' => 'missing_path', 'message' => '缺少 path 参数']);
    exit;
}

$parts = parse_url($path);
$pathOnly = $parts['path'] ?? '';
$query = isset($parts['query']) ? ('?' . $parts['query']) : '';

if (!preg_match('#^/(auth/v1|rest/v1|functions/v1)/#', $pathOnly)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden_path', 'message' => '只允许转发 Supabase 路径']);
    exit;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST'));
$allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
if (!in_array($method, $allowedMethods, true)) {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed', 'message' => '请求方法不允许']);
    exit;
}

function request_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return (string) $_SERVER[$key];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp((string) $k, $name) === 0) {
                return (string) $v;
            }
        }
    }
    return '';
}

// 优先取用户 JWT。Apache 有时会丢弃 Authorization，
// 所以 bridge.html 会同时传 X-User-Token。
$authorization = request_header('Authorization');
$userToken = request_header('X-User-Token');
if ($userToken !== '') {
    $authorization = $userToken;
}
if ($authorization === '') {
    $authorization = 'Bearer ' . SUPABASE_ANON_KEY;
}
if (stripos($authorization, 'Bearer ') !== 0) {
    $authorization = 'Bearer ' . $authorization;
}

$contentType = request_header('Content-Type');
if ($contentType === '') {
    $contentType = 'application/json';
}
$accept = request_header('Accept');
if ($accept === '') {
    $accept = 'application/json';
}
$prefer = request_header('Prefer');
if ($prefer === '' && strpos($pathOnly, '/rest/v1/') === 0) {
    // 保持与参考 proxy.php 一致；auth 端点不加
    $prefer = 'return=representation';
}

$headers = [
    'apikey: ' . SUPABASE_ANON_KEY,
    'Authorization: ' . $authorization,
    'Content-Type: ' . $contentType,
    'Accept: ' . $accept,
];
if ($prefer !== '') {
    $headers[] = 'Prefer: ' . $prefer;
}

$body = file_get_contents('php://input');
$url = rtrim(SUPABASE_URL, '/') . $pathOnly . $query;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_FOLLOWLOCATION => false,
]);

if ($body !== false && $body !== '' && $method !== 'GET' && $method !== 'HEAD') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'error' => 'proxy_failed',
        'message' => $error !== '' ? $error : '无法连接 Supabase'
    ]);
    exit;
}

http_response_code($status > 0 ? $status : 502);
echo $response;
