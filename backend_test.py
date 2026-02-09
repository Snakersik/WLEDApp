#!/usr/bin/env python3

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = "https://light-control-hub-3.preview.emergentagent.com/api"

print("="*80)
print("WLED Device Manager Backend API Testing")
print("="*80)
print(f"Backend URL: {BACKEND_URL}")
print(f"Test started at: {datetime.now()}")
print("="*80)

# Test data
test_user = {
    "email": "testuser@example.com", 
    "password": "testpass123",
    "name": "Test User"
}

test_device = {
    "name": "Living Room LEDs",
    "ip_address": "192.168.1.100",  # Non-existent IP to test error handling
    "led_count": 150
}

test_group_data = {
    "name": "All Lights",
    "device_ids": []  # Will be populated after device creation
}

# Global variables for test results
auth_token = None
device_id = None
group_id = None
test_results = {}

def log_test(test_name, success, message="", details=None):
    """Log test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n{status} - {test_name}")
    if message:
        print(f"    {message}")
    if details:
        print(f"    Details: {details}")
    
    test_results[test_name] = {
        "success": success,
        "message": message,
        "details": details
    }

def make_request(method, url, data=None, headers=None, expect_fail=False):
    """Make HTTP request with error handling"""
    try:
        if headers is None:
            headers = {"Content-Type": "application/json"}
        
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=10)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=10)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=10)
        
        return response
    except requests.exceptions.RequestException as e:
        if not expect_fail:
            log_test(f"Request to {url}", False, f"Network error: {str(e)}")
        return None

# ============ AUTHENTICATION TESTS ============

def test_user_registration():
    """Test user registration endpoint"""
    print("\n--- Testing User Registration ---")
    
    response = make_request("POST", f"{BACKEND_URL}/auth/register", test_user)
    
    if response is None:
        return False
    
    if response.status_code == 201 or response.status_code == 200:
        try:
            data = response.json()
            if "access_token" in data and "user" in data:
                global auth_token
                auth_token = data["access_token"]
                log_test("User Registration", True, f"User registered successfully. Token received.")
                return True
            else:
                log_test("User Registration", False, "Missing token or user data in response", data)
                return False
        except json.JSONDecodeError:
            log_test("User Registration", False, "Invalid JSON response", response.text)
            return False
    elif response.status_code == 400:
        # User might already exist, try login instead
        print("User already exists, proceeding to login test...")
        return True
    else:
        log_test("User Registration", False, f"HTTP {response.status_code}", response.text)
        return False

def test_user_login():
    """Test user login endpoint"""
    print("\n--- Testing User Login ---")
    
    response = make_request("POST", f"{BACKEND_URL}/auth/login", {
        "email": test_user["email"],
        "password": test_user["password"]
    })
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "access_token" in data and "user" in data:
                global auth_token
                auth_token = data["access_token"]
                log_test("User Login", True, "Login successful. Token received.")
                return True
            else:
                log_test("User Login", False, "Missing token or user data in response", data)
                return False
        except json.JSONDecodeError:
            log_test("User Login", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("User Login", False, f"HTTP {response.status_code}", response.text)
        return False

def test_get_current_user():
    """Test get current user endpoint"""
    print("\n--- Testing Get Current User ---")
    
    if not auth_token:
        log_test("Get Current User", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/auth/me", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "email" in data and "name" in data:
                log_test("Get Current User", True, f"User info retrieved: {data['name']}")
                return True
            else:
                log_test("Get Current User", False, "Missing user fields in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Get Current User", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Get Current User", False, f"HTTP {response.status_code}", response.text)
        return False

def test_upgrade_subscription():
    """Test mock subscription upgrade"""
    print("\n--- Testing Subscription Upgrade ---")
    
    if not auth_token:
        log_test("Subscription Upgrade", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("POST", f"{BACKEND_URL}/auth/upgrade-subscription", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "message" in data:
                log_test("Subscription Upgrade", True, "Subscription upgraded successfully")
                return True
            else:
                log_test("Subscription Upgrade", False, "Missing message in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Subscription Upgrade", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Subscription Upgrade", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ DEVICE MANAGEMENT TESTS ============

def test_create_device():
    """Test device creation endpoint"""
    print("\n--- Testing Device Creation ---")
    
    if not auth_token:
        log_test("Device Creation", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("POST", f"{BACKEND_URL}/devices", test_device, headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200 or response.status_code == 201:
        try:
            data = response.json()
            if "id" in data and "name" in data:
                global device_id
                device_id = data["id"]
                log_test("Device Creation", True, f"Device created: {data['name']} (ID: {device_id})")
                return True
            else:
                log_test("Device Creation", False, "Missing device fields in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Device Creation", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Device Creation", False, f"HTTP {response.status_code}", response.text)
        return False

def test_list_devices():
    """Test device listing endpoint"""
    print("\n--- Testing Device Listing ---")
    
    if not auth_token:
        log_test("Device Listing", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/devices", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if isinstance(data, list):
                log_test("Device Listing", True, f"Retrieved {len(data)} devices")
                return True
            else:
                log_test("Device Listing", False, "Response is not a list", data)
                return False
        except json.JSONDecodeError:
            log_test("Device Listing", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Device Listing", False, f"HTTP {response.status_code}", response.text)
        return False

def test_get_single_device():
    """Test single device retrieval endpoint"""
    print("\n--- Testing Single Device Retrieval ---")
    
    if not auth_token or not device_id:
        log_test("Single Device Retrieval", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/devices/{device_id}", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "id" in data and "name" in data:
                log_test("Single Device Retrieval", True, f"Device retrieved: {data['name']}")
                return True
            else:
                log_test("Single Device Retrieval", False, "Missing device fields in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Single Device Retrieval", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Single Device Retrieval", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ DEVICE CONTROL TESTS ============

def test_device_control_on_off():
    """Test device on/off control"""
    print("\n--- Testing Device On/Off Control ---")
    
    if not auth_token or not device_id:
        log_test("Device On/Off Control", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Test turning on
    control_data = {"on": True}
    response = make_request("POST", f"{BACKEND_URL}/devices/{device_id}/control", control_data, headers=headers)
    
    if response is None:
        return False
    
    # Expect this to fail gracefully since no real WLED device
    if response.status_code in [500, 520]:  # 520 might be returned by load balancer
        try:
            data = response.json()
            if "detail" in data and ("timeout" in data["detail"].lower() or "device" in data["detail"].lower()):
                log_test("Device On/Off Control", True, "Correctly failed - no real WLED device available")
                return True
            else:
                log_test("Device On/Off Control", False, "Unexpected error message", data)
                return False
        except json.JSONDecodeError:
            log_test("Device On/Off Control", True, "Failed as expected - no real device")
            return True
    elif response.status_code == 200:
        # Unexpected success (unless there's actually a device)
        log_test("Device On/Off Control", True, "Device control successful (real device found?)")
        return True
    else:
        log_test("Device On/Off Control", False, f"HTTP {response.status_code}", response.text)
        return False

def test_device_control_brightness():
    """Test device brightness control"""
    print("\n--- Testing Device Brightness Control ---")
    
    if not auth_token or not device_id:
        log_test("Device Brightness Control", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    control_data = {"brightness": 128}
    response = make_request("POST", f"{BACKEND_URL}/devices/{device_id}/control", control_data, headers=headers)
    
    if response is None:
        return False
    
    # Expect this to fail gracefully since no real WLED device
    if response.status_code in [500, 520]:  # 520 might be returned by load balancer
        log_test("Device Brightness Control", True, "Correctly failed - no real WLED device available")
        return True
    elif response.status_code == 200:
        log_test("Device Brightness Control", True, "Device brightness control successful")
        return True
    else:
        log_test("Device Brightness Control", False, f"HTTP {response.status_code}", response.text)
        return False

def test_device_control_color():
    """Test device color control"""
    print("\n--- Testing Device Color Control ---")
    
    if not auth_token or not device_id:
        log_test("Device Color Control", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    control_data = {"color": [255, 0, 0]}  # Red
    response = make_request("POST", f"{BACKEND_URL}/devices/{device_id}/control", control_data, headers=headers)
    
    if response is None:
        return False
    
    # Expect this to fail gracefully since no real WLED device
    if response.status_code == 500:
        log_test("Device Color Control", True, "Correctly failed - no real WLED device available")
        return True
    elif response.status_code == 200:
        log_test("Device Color Control", True, "Device color control successful")
        return True
    else:
        log_test("Device Color Control", False, f"HTTP {response.status_code}", response.text)
        return False

def test_device_control_preset():
    """Test device preset control"""
    print("\n--- Testing Device Preset Control ---")
    
    if not auth_token or not device_id:
        log_test("Device Preset Control", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Test free preset first
    control_data = {"preset_id": "solid"}
    response = make_request("POST", f"{BACKEND_URL}/devices/{device_id}/control", control_data, headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 500:
        log_test("Device Preset Control (Free)", True, "Correctly failed - no real WLED device available")
    elif response.status_code == 200:
        log_test("Device Preset Control (Free)", True, "Free preset control successful")
    else:
        log_test("Device Preset Control (Free)", False, f"HTTP {response.status_code}", response.text)
        return False
    
    # Test premium preset (should work since we upgraded subscription)
    control_data = {"preset_id": "rainbow"}
    response = make_request("POST", f"{BACKEND_URL}/devices/{device_id}/control", control_data, headers=headers)
    
    if response.status_code == 500:
        log_test("Device Preset Control (Premium)", True, "Correctly failed - no real WLED device available")
        return True
    elif response.status_code == 200:
        log_test("Device Preset Control (Premium)", True, "Premium preset control successful")
        return True
    elif response.status_code == 403:
        log_test("Device Preset Control (Premium)", False, "Premium preset blocked - subscription not working")
        return False
    else:
        log_test("Device Preset Control (Premium)", False, f"HTTP {response.status_code}", response.text)
        return False

def test_get_device_state():
    """Test device state retrieval"""
    print("\n--- Testing Device State Retrieval ---")
    
    if not auth_token or not device_id:
        log_test("Device State Retrieval", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/devices/{device_id}/state", headers=headers)
    
    if response is None:
        return False
    
    # Expect this to fail gracefully since no real WLED device
    if response.status_code == 500:
        log_test("Device State Retrieval", True, "Correctly failed - no real WLED device available")
        return True
    elif response.status_code == 200:
        log_test("Device State Retrieval", True, "Device state retrieved successfully")
        return True
    else:
        log_test("Device State Retrieval", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ GROUP MANAGEMENT TESTS ============

def test_create_group():
    """Test group creation endpoint"""
    print("\n--- Testing Group Creation ---")
    
    if not auth_token or not device_id:
        log_test("Group Creation", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Update group data with device ID
    test_group_data["device_ids"] = [device_id]
    
    response = make_request("POST", f"{BACKEND_URL}/groups", test_group_data, headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200 or response.status_code == 201:
        try:
            data = response.json()
            if "id" in data and "name" in data:
                global group_id
                group_id = data["id"]
                log_test("Group Creation", True, f"Group created: {data['name']} (ID: {group_id})")
                return True
            else:
                log_test("Group Creation", False, "Missing group fields in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Group Creation", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Group Creation", False, f"HTTP {response.status_code}", response.text)
        return False

def test_list_groups():
    """Test group listing endpoint"""
    print("\n--- Testing Group Listing ---")
    
    if not auth_token:
        log_test("Group Listing", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/groups", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if isinstance(data, list):
                log_test("Group Listing", True, f"Retrieved {len(data)} groups")
                return True
            else:
                log_test("Group Listing", False, "Response is not a list", data)
                return False
        except json.JSONDecodeError:
            log_test("Group Listing", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Group Listing", False, f"HTTP {response.status_code}", response.text)
        return False

def test_update_group():
    """Test group update endpoint"""
    print("\n--- Testing Group Update ---")
    
    if not auth_token or not group_id or not device_id:
        log_test("Group Update", False, "No auth token, group ID, or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    update_data = {
        "name": "Updated Light Group",
        "device_ids": [device_id]
    }
    
    response = make_request("PUT", f"{BACKEND_URL}/groups/{group_id}", update_data, headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "name" in data and data["name"] == "Updated Light Group":
                log_test("Group Update", True, f"Group updated successfully: {data['name']}")
                return True
            else:
                log_test("Group Update", False, "Group name not updated properly", data)
                return False
        except json.JSONDecodeError:
            log_test("Group Update", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Group Update", False, f"HTTP {response.status_code}", response.text)
        return False

def test_control_group():
    """Test group control endpoint"""
    print("\n--- Testing Group Control ---")
    
    if not auth_token or not group_id:
        log_test("Group Control", False, "No auth token or group ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    control_data = {"on": True, "brightness": 200}
    response = make_request("POST", f"{BACKEND_URL}/groups/{group_id}/control", control_data, headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "message" in data and "results" in data:
                log_test("Group Control", True, "Group control executed successfully")
                return True
            else:
                log_test("Group Control", False, "Missing expected fields in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Group Control", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Group Control", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ PRESET TESTS ============

def test_get_presets():
    """Test presets listing endpoint"""
    print("\n--- Testing Presets Listing ---")
    
    # Presets endpoint doesn't require authentication
    response = make_request("GET", f"{BACKEND_URL}/presets")
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                free_presets = [p for p in data if not p.get("is_premium", True)]
                premium_presets = [p for p in data if p.get("is_premium", False)]
                log_test("Presets Listing", True, f"Retrieved {len(data)} presets ({len(free_presets)} free, {len(premium_presets)} premium)")
                return True
            else:
                log_test("Presets Listing", False, "No presets found or invalid format", data)
                return False
        except json.JSONDecodeError:
            log_test("Presets Listing", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Presets Listing", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ SCHEDULE TESTS ============

def test_get_schedules():
    """Test schedules listing endpoint"""
    print("\n--- Testing Schedules Listing ---")
    
    if not auth_token:
        log_test("Schedules Listing", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("GET", f"{BACKEND_URL}/schedules", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if isinstance(data, list):
                log_test("Schedules Listing", True, f"Retrieved {len(data)} schedules (empty list OK)")
                return True
            else:
                log_test("Schedules Listing", False, "Response is not a list", data)
                return False
        except json.JSONDecodeError:
            log_test("Schedules Listing", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Schedules Listing", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ AUTHORIZATION TESTS ============

def test_unauthorized_access():
    """Test endpoints without authentication token"""
    print("\n--- Testing Unauthorized Access ---")
    
    endpoints_to_test = [
        ("GET", "/auth/me"),
        ("POST", "/devices"),
        ("GET", "/devices"),
        ("GET", "/groups"),
    ]
    
    all_passed = True
    
    # Test without token - should return 401 or 403
    response = make_request("GET", f"{BACKEND_URL}/auth/me")
    if response and response.status_code in [401, 403]:
        print(f"    ✅ GET /auth/me correctly blocked ({response.status_code})")
    else:
        print(f"    ❌ GET /auth/me not properly protected")
        all_passed = False
    
    response = make_request("POST", f"{BACKEND_URL}/devices")
    if response and response.status_code in [401, 403]:
        print(f"    ✅ POST /devices correctly blocked ({response.status_code})")
    else:
        print(f"    ❌ POST /devices not properly protected")
        all_passed = False
    
    response = make_request("GET", f"{BACKEND_URL}/devices")
    if response and response.status_code in [401, 403]:
        print(f"    ✅ GET /devices correctly blocked ({response.status_code})")
    else:
        print(f"    ❌ GET /devices not properly protected")
        all_passed = False
    
    response = make_request("GET", f"{BACKEND_URL}/groups")
    if response and response.status_code in [401, 403]:
        print(f"    ✅ GET /groups correctly blocked ({response.status_code})")
    else:
        print(f"    ❌ GET /groups not properly protected")
        all_passed = False
    
    log_test("Unauthorized Access Protection", all_passed, "All tested endpoints properly protected" if all_passed else "Some endpoints not properly protected")
    return all_passed

def test_invalid_token_access():
    """Test endpoints with invalid authentication token"""
    print("\n--- Testing Invalid Token Access ---")
    
    headers = {"Authorization": "Bearer invalid_token_12345"}
    
    endpoints_to_test = [
        ("GET", "/auth/me"),
        ("GET", "/devices"),
    ]
    
    all_passed = True
    
    # Test with invalid token - should return 401 or 403  
    headers = {"Authorization": "Bearer invalid_token"}
    
    for method, endpoint in endpoints_to_test:
        response = make_request(method, f"{BACKEND_URL}{endpoint}", headers=headers)
        if response and response.status_code in [401, 403]:
            print(f"    ✅ {method} {endpoint} correctly rejected invalid token ({response.status_code})")
        else:
            print(f"    ❌ {method} {endpoint} accepted invalid token")
            all_passed = False
    
    log_test("Invalid Token Protection", all_passed, "All tested endpoints properly reject invalid tokens" if all_passed else "Some endpoints accept invalid tokens")
    return all_passed

# ============ CLEANUP TESTS ============

def test_delete_group():
    """Test group deletion endpoint"""
    print("\n--- Testing Group Deletion ---")
    
    if not auth_token or not group_id:
        log_test("Group Deletion", False, "No auth token or group ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("DELETE", f"{BACKEND_URL}/groups/{group_id}", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "message" in data:
                log_test("Group Deletion", True, "Group deleted successfully")
                return True
            else:
                log_test("Group Deletion", False, "Missing message in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Group Deletion", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Group Deletion", False, f"HTTP {response.status_code}", response.text)
        return False

def test_delete_device():
    """Test device deletion endpoint"""
    print("\n--- Testing Device Deletion ---")
    
    if not auth_token or not device_id:
        log_test("Device Deletion", False, "No auth token or device ID available")
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = make_request("DELETE", f"{BACKEND_URL}/devices/{device_id}", headers=headers)
    
    if response is None:
        return False
    
    if response.status_code == 200:
        try:
            data = response.json()
            if "message" in data:
                log_test("Device Deletion", True, "Device deleted successfully")
                return True
            else:
                log_test("Device Deletion", False, "Missing message in response", data)
                return False
        except json.JSONDecodeError:
            log_test("Device Deletion", False, "Invalid JSON response", response.text)
            return False
    else:
        log_test("Device Deletion", False, f"HTTP {response.status_code}", response.text)
        return False

# ============ MAIN TEST EXECUTION ============

def main():
    """Run all tests"""
    print("Starting comprehensive backend API testing...\n")
    
    # Authentication Tests
    test_user_registration()
    test_user_login()
    test_get_current_user()
    test_upgrade_subscription()
    
    # Device Management Tests
    test_create_device()
    test_list_devices()
    test_get_single_device()
    
    # Device Control Tests
    test_device_control_on_off()
    test_device_control_brightness()
    test_device_control_color()
    test_device_control_preset()
    test_get_device_state()
    
    # Group Management Tests
    test_create_group()
    test_list_groups()
    test_update_group()
    test_control_group()
    
    # Preset Tests
    test_get_presets()
    
    # Authorization Tests
    test_unauthorized_access()
    test_invalid_token_access()
    
    # Cleanup Tests
    test_delete_group()
    test_delete_device()
    
    # Print Summary
    print("\n" + "="*80)
    print("TEST RESULTS SUMMARY")
    print("="*80)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results.values() if result["success"])
    failed_tests = total_tests - passed_tests
    
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
    
    if failed_tests > 0:
        print(f"\nFAILED TESTS:")
        for test_name, result in test_results.items():
            if not result["success"]:
                print(f"  ❌ {test_name}: {result['message']}")
    
    print("\n" + "="*80)
    return failed_tests == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)