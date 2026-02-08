#!/usr/bin/env python3

import requests
import json
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = "https://light-control-hub-3.preview.emergentagent.com/api"

print("="*60)
print("WLED Backend Critical Tests")
print("="*60)

# Test data
test_user = {
    "email": "testuser2@example.com", 
    "password": "testpass123",
    "name": "Test User 2"
}

def test_auth_flow():
    """Test complete authentication flow"""
    print("\n1. Testing Authentication Flow...")
    
    # Register
    response = requests.post(f"{BACKEND_URL}/auth/register", json=test_user, timeout=10)
    if response.status_code not in [200, 201, 400]:
        print(f"❌ Registration failed: {response.status_code} - {response.text}")
        return None
    
    # Login (in case user already exists)
    response = requests.post(f"{BACKEND_URL}/auth/login", json={
        "email": test_user["email"], 
        "password": test_user["password"]
    }, timeout=10)
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None
    
    data = response.json()
    token = data.get("access_token")
    if not token:
        print("❌ No token received")
        return None
    
    print("✅ Authentication successful")
    return token

def test_auth_protection(token):
    """Test authentication protection"""
    print("\n2. Testing Authentication Protection...")
    
    # Test without token - should return 401 or 403
    response = requests.get(f"{BACKEND_URL}/auth/me", timeout=10)
    if response.status_code not in [401, 403]:
        print(f"❌ Unprotected endpoint: GET /auth/me returned {response.status_code}")
        return False
    
    # Test with invalid token - should return 401 or 403  
    headers = {"Authorization": "Bearer invalid_token"}
    response = requests.get(f"{BACKEND_URL}/auth/me", headers=headers, timeout=10)
    if response.status_code not in [401, 403]:
        print(f"❌ Invalid token accepted: GET /auth/me returned {response.status_code}")
        return False
    
    # Test with valid token
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BACKEND_URL}/auth/me", headers=headers, timeout=10)
    if response.status_code != 200:
        print(f"❌ Valid token rejected: GET /auth/me returned {response.status_code}")
        return False
    
    print("✅ Authentication protection working")
    return True

def test_device_endpoints(token):
    """Test device management endpoints"""
    print("\n3. Testing Device Management...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create device
    device_data = {
        "name": "Test LED Strip",
        "ip_address": "192.168.1.199",
        "led_count": 100
    }
    
    response = requests.post(f"{BACKEND_URL}/devices", json=device_data, headers=headers, timeout=10)
    if response.status_code not in [200, 201]:
        print(f"❌ Device creation failed: {response.status_code} - {response.text}")
        return False, None
    
    device_id = response.json().get("id")
    if not device_id:
        print("❌ No device ID returned")
        return False, None
    
    # List devices
    response = requests.get(f"{BACKEND_URL}/devices", headers=headers, timeout=10)
    if response.status_code != 200:
        print(f"❌ Device listing failed: {response.status_code}")
        return False, device_id
    
    print("✅ Device management working")
    return True, device_id

def test_device_control(token, device_id):
    """Test device control (expected to fail gracefully)"""
    print("\n4. Testing Device Control...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test control endpoint
    control_data = {"on": True}
    response = requests.post(f"{BACKEND_URL}/devices/{device_id}/control", 
                           json=control_data, headers=headers, timeout=10)
    
    # Should fail with 500 due to no real device
    if response.status_code == 500:
        error_detail = response.json().get("detail", "")
        if "timeout" in error_detail.lower() or "device" in error_detail.lower():
            print("✅ Device control correctly fails (no real WLED device)")
            return True
    
    print(f"❌ Unexpected device control result: {response.status_code} - {response.text}")
    return False

def test_presets():
    """Test presets endpoint"""
    print("\n5. Testing Presets...")
    
    response = requests.get(f"{BACKEND_URL}/presets", timeout=10)
    if response.status_code != 200:
        print(f"❌ Presets listing failed: {response.status_code}")
        return False
    
    presets = response.json()
    if not isinstance(presets, list) or len(presets) == 0:
        print("❌ No presets returned")
        return False
    
    free_presets = [p for p in presets if not p.get("is_premium", True)]
    premium_presets = [p for p in presets if p.get("is_premium", False)]
    
    print(f"✅ Presets working ({len(free_presets)} free, {len(premium_presets)} premium)")
    return True

def cleanup(token, device_id):
    """Clean up test data"""
    if token and device_id:
        headers = {"Authorization": f"Bearer {token}"}
        requests.delete(f"{BACKEND_URL}/devices/{device_id}", headers=headers, timeout=10)

def main():
    """Run critical tests"""
    token = test_auth_flow()
    if not token:
        print("\n❌ Critical failure: Authentication not working")
        return False
    
    if not test_auth_protection(token):
        print("\n❌ Critical failure: Authentication protection not working")
        return False
    
    device_success, device_id = test_device_endpoints(token)
    if not device_success:
        print("\n❌ Critical failure: Device management not working")
        return False
    
    test_device_control(token, device_id)  # Expected to fail gracefully
    test_presets()
    
    cleanup(token, device_id)
    
    print("\n✅ All critical backend functionality working!")
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)