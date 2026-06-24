import Foundation

struct ProviderStatus: Codable, Hashable {
    let provider: String
    let label: String
    let type: String
    let hasKey: Bool
    let activeMaskedKey: String?
    let profileKey: String
    let profiles: [ProfileStatus]
}

struct ProfileStatus: Codable, Hashable {
    let name: String
    let description: String?
    let maskedKey: String?
    let active: Bool
}

struct StatusResponse: Codable {
    let providers: [ProviderStatus]
}

struct SetRequest: Encodable {
    let provider: String
    let name: String
}

struct AddRequest: Encodable {
    let provider: String
    let name: String
    let key: String
    let description: String?
}

struct DeleteRequest: Encodable {
    let provider: String
    let name: String
}

struct MutationResponse: Codable {
    let ok: Bool
    let error: String?
    let provider: String?
    let name: String?
    let label: String?
    let wasActive: Bool?
}

struct CreditsResponse: Codable {
    let provider: String
    let error: String?
    let pioneer: PioneerCredits?
    let zen: ZenCredits?
    let go: GoCredits?

    struct PioneerCredits: Codable {
        let team_name: String?
        let credit_limit: Double
        let current_period_usage: Double
        let current_period_requests: Int?
        let usage_reset_hour: Int?
        let usage_reset_timezone: String?
        let remaining: Double
        let remaining_usd: Double
    }

    struct ZenCredits: Codable {
        let error: String?
        let zenCost: Double?
        let totalCost: Double?
        let avgCostPerDay: Double?
        let zenMessages: Int?
        let modelCosts: [String: Double]?
    }

    struct GoCredits: Codable {
        let error: String?
        let modelCount: Int?
        let maxUsedPercent: Double?
        let rolling: GoWindow?
        let weekly: GoWindow?
        let monthly: GoWindow?
        let source: String?

        struct GoWindow: Codable {
            let usagePercent: Double
            let resetInSec: Int?
        }
    }
}

struct HealthResponse: Codable {
    let ok: Bool
}
