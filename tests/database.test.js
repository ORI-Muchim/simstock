const { createUser, authenticateUser, getUserData, updateUserData } = require('../database');
const bcrypt = require('bcrypt');

describe('Database Functions', () => {
  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const username = `testuser_${Date.now()}`;
      const password = 'testpassword123';
      
      const userId = await createUser(username, password);
      
      expect(userId).toBeDefined();
      expect(typeof userId).toBe('number');
      expect(userId).toBeGreaterThan(0);
    });

    it('should hash the password', async () => {
      const username = `testuser_hash_${Date.now()}`;
      const password = 'testpassword123';
      
      await createUser(username, password);
      const user = await authenticateUser(username, password);
      
      expect(user).toBeDefined();
      expect(user.password).not.toBe(password);
      expect(user.password.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should throw error for duplicate username', async () => {
      const username = `duplicate_${Date.now()}`;
      const password = 'testpassword123';
      
      await createUser(username, password);
      
      await expect(createUser(username, password)).rejects.toThrow();
    });

    it('should create initial user data', async () => {
      const username = `userdata_${Date.now()}`;
      const password = 'testpassword123';
      
      const userId = await createUser(username, password);
      const userData = await getUserData(userId);
      
      expect(userData).toBeDefined();
      expect(userData.usd_balance).toBe(10000); // Default balance
      expect(userData.btc_balance).toBe(0);
      expect(userData.transactions).toEqual([]);
      expect(userData.leverage_positions).toEqual([]);
    });
  });

  describe('authenticateUser', () => {
    let testUsername;
    let testPassword;

    beforeEach(async () => {
      testUsername = `auth_test_${Date.now()}`;
      testPassword = 'testpassword123';
      await createUser(testUsername, testPassword);
    });

    it('should authenticate user with correct credentials', async () => {
      const user = await authenticateUser(testUsername, testPassword);
      
      expect(user).toBeDefined();
      expect(user.username).toBe(testUsername);
      expect(user.id).toBeDefined();
    });

    it('should return null for incorrect password', async () => {
      const user = await authenticateUser(testUsername, 'wrongpassword');
      
      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await authenticateUser('nonexistent', testPassword);
      
      expect(user).toBeNull();
    });

    it('should return null for empty credentials', async () => {
      const user1 = await authenticateUser('', testPassword);
      const user2 = await authenticateUser(testUsername, '');
      const user3 = await authenticateUser('', '');
      
      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(user3).toBeNull();
    });
  });

  describe('getUserData', () => {
    let userId;

    beforeEach(async () => {
      const username = `userdata_test_${Date.now()}`;
      userId = await createUser(username, 'testpassword123');
    });

    it('should retrieve user data', async () => {
      const userData = await getUserData(userId);
      
      expect(userData).toBeDefined();
      expect(userData.user_id).toBe(userId);
      expect(userData.usd_balance).toBe(10000);
      expect(userData.btc_balance).toBe(0);
      expect(Array.isArray(userData.transactions)).toBe(true);
      expect(Array.isArray(userData.leverage_positions)).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      const userData = await getUserData(99999);
      
      expect(userData).toBeNull();
    });

    it('should parse JSON fields correctly', async () => {
      const userData = await getUserData(userId);
      
      expect(Array.isArray(userData.transactions)).toBe(true);
      expect(Array.isArray(userData.leverage_positions)).toBe(true);
    });
  });

  describe('updateUserData', () => {
    let userId;

    beforeEach(async () => {
      const username = `update_test_${Date.now()}`;
      userId = await createUser(username, 'testpassword123');
    });

    it('should update user data successfully', async () => {
      const updateData = {
        usdBalance: 5000,
        btcBalance: 0.1,
        transactions: [{ type: 'buy', amount: 0.1 }],
        leveragePositions: [],
        timezone: 'Asia/Seoul'
      };
      
      await updateUserData(userId, updateData);
      const userData = await getUserData(userId);
      
      expect(userData.usd_balance).toBe(5000);
      expect(userData.btc_balance).toBe(0.1);
      expect(userData.transactions).toEqual([{ type: 'buy', amount: 0.1 }]);
      expect(userData.timezone).toBe('Asia/Seoul');
    });

    it('should handle empty arrays', async () => {
      const updateData = {
        usdBalance: 1000,
        btcBalance: 0,
        transactions: [],
        leveragePositions: [],
        timezone: 'UTC'
      };
      
      await updateUserData(userId, updateData);
      const userData = await getUserData(userId);
      
      expect(userData.transactions).toEqual([]);
      expect(userData.leverage_positions).toEqual([]);
    });

    it('should update timestamp', async () => {
      const beforeUpdate = new Date();
      
      await updateUserData(userId, {
        usdBalance: 9000,
        btcBalance: 0,
        transactions: [],
        leveragePositions: [],
        timezone: 'UTC'
      });
      
      const userData = await getUserData(userId);
      const updatedAt = new Date(userData.updated_at);
      
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });
});