//latest
-- -- ============================================
-- -- ELECTION SERVICE DATABASE SCHEMA
-- -- Complete Schema with All Tables
-- -- ============================================

-- -- Core Elections Table
CREATE TABLE votteryyy_elections (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL,
  creator_type VARCHAR(50) NOT NULL CHECK (creator_type IN ('individual', 'organization', 'content_creator')),
  organization_id INTEGER,
  
  -- Basic Info
  title VARCHAR(500) NOT NULL,
  description TEXT,
  slug VARCHAR(255) UNIQUE,
  
  -- Media
  topic_image_url TEXT,
  topic_video_url TEXT,
  logo_url TEXT,
  
  -- Scheduling
  start_date TIMESTAMP NOT NULL,
  start_time TIME,
  end_date TIMESTAMP NOT NULL,
  end_time TIME,
  timezone VARCHAR(100) DEFAULT 'UTC',
  
  -- Voting Configuration
  voting_type VARCHAR(50) NOT NULL CHECK (voting_type IN ('plurality', 'ranked_choice', 'approval')),
  voting_body_content TEXT,
  
  -- Access Control
  permission_type VARCHAR(50) NOT NULL CHECK (permission_type IN ('public', 'country_specific', 'organization_only')),
  allowed_countries TEXT[], -- Array of country codes ['US', 'BD', 'IN']
  
  -- Pricing
  is_free BOOLEAN DEFAULT TRUE,
  pricing_type VARCHAR(50) CHECK (pricing_type IN ('free', 'general_fee', 'regional_fee')),
  general_participation_fee DECIMAL(10, 2) DEFAULT 0.00,
  processing_fee_percentage DECIMAL(5, 2) DEFAULT 0.00,
  
  -- Biometric & Authentication
  biometric_required BOOLEAN DEFAULT FALSE,
  authentication_methods TEXT[] DEFAULT ARRAY['passkey'],
  
  -- Custom Branding
  custom_url VARCHAR(255) UNIQUE,
  corporate_style JSONB,
  
  -- Live Results Control (NEW)
  show_live_results BOOLEAN DEFAULT FALSE,
  vote_editing_allowed BOOLEAN DEFAULT FALSE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled')),
  
  -- Subscription Link
  subscription_plan_id INTEGER,
  
  -- Metadata
  view_count INTEGER DEFAULT 0,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  
  CONSTRAINT fk_creator FOREIGN KEY (creator_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE
);

-- -- Regional Pricing Configuration
CREATE TABLE votteryy_election_regional_pricing (
  id SERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL,
  region_code VARCHAR(50) NOT NULL CHECK (region_code IN (
    'region_1_us_canada',
    'region_2_western_europe',
    'region_3_eastern_europe',
    'region_4_africa',
    'region_5_latin_america',
    'region_6_middle_east_asia',
    'region_7_australasia',
    'region_8_china'
  )),
  region_name VARCHAR(255) NOT NULL,
  participation_fee DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  processing_fee_percentage DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_election_regional FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
  UNIQUE(election_id, region_code)
);

-- -- Election Questions
CREATE TABLE votteryy_election_questions (
  id SERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL CHECK (question_type IN ('multiple_choice', 'open_text', 'image_based')),
  question_image_url TEXT,
  question_order INTEGER NOT NULL DEFAULT 1,
  is_required BOOLEAN DEFAULT TRUE,
  max_selections INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_election_question FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
);

-- -- Answer Options for Questions
CREATE TABLE votteryy_election_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL,
  option_text TEXT NOT NULL,
  option_image_url TEXT,
  option_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_question_option FOREIGN KEY (question_id) REFERENCES votteryyy_election_questions(id) ON DELETE CASCADE
);

-- -- Draft Elections (Temporary Storage)
CREATE TABLE votteryy_election_drafts (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL,
  creator_type VARCHAR(50) NOT NULL CHECK (creator_type IN ('individual', 'organization', 'content_creator')),
  organization_id INTEGER,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  draft_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_draft_creator FOREIGN KEY (creator_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE
);

-- -- Organizations
-- CREATE TABLE votteryy_organizations (
--   id SERIAL PRIMARY KEY,
--   owner_id INTEGER NOT NULL,
--   organization_name VARCHAR(255) NOT NULL,
--   organization_type VARCHAR(100),
--   description TEXT,
--   logo_url TEXT,
--   website VARCHAR(255),
--   email VARCHAR(255),
--   phone VARCHAR(50),
--   country VARCHAR(100),
--   city VARCHAR(100),
--   address TEXT,
--   is_active BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE
-- );

-- -- Organization Members
-- CREATE TABLE votteryy_organization_members (
--   id SERIAL PRIMARY KEY,
--   organization_id INTEGER NOT NULL,
--   user_id INTEGER NOT NULL,
--   role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
--   permissions JSONB DEFAULT '{}',
--   invited_by INTEGER,
--   invitation_status VARCHAR(50) DEFAULT 'accepted' CHECK (invitation_status IN ('pending', 'accepted', 'rejected')),
--   joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_org_member_org FOREIGN KEY (organization_id) REFERENCES votteryy_organizations(id) ON DELETE CASCADE,
--   CONSTRAINT fk_org_member_user FOREIGN KEY (user_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE,
--   UNIQUE(organization_id, user_id)
-- );

-- -- Election Access Rules
-- CREATE TABLE votteryy_election_access_rules (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('country', 'organization', 'role', 'custom')),
--   rule_value TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_access_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
-- );

-- -- Custom URLs/Slugs
-- CREATE TABLE votteryy_election_custom_urls (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   custom_slug VARCHAR(255) UNIQUE NOT NULL,
--   is_active BOOLEAN DEFAULT TRUE,
--   click_count INTEGER DEFAULT 0,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_custom_url_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
-- );

-- -- Election Settings (Key-Value pairs)
-- CREATE TABLE votteryy_election_settings (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   setting_key VARCHAR(100) NOT NULL,
--   setting_value TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_setting_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   UNIQUE(election_id, setting_key)
-- );

-- -- Organization Invitations
-- CREATE TABLE votteryy_organization_invitations (
--   id SERIAL PRIMARY KEY,
--   organization_id INTEGER NOT NULL,
--   invited_email VARCHAR(255) NOT NULL,
--   invited_by INTEGER NOT NULL,
--   role VARCHAR(50) NOT NULL,
--   invitation_token VARCHAR(255) UNIQUE,
--   status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
--   expires_at TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   responded_at TIMESTAMP,
  
--   CONSTRAINT fk_invitation_org FOREIGN KEY (organization_id) REFERENCES votteryy_organizations(id) ON DELETE CASCADE,
--   CONSTRAINT fk_invitation_inviter FOREIGN KEY (invited_by) REFERENCES votteryy_user_details(id) ON DELETE CASCADE
-- );

-- -- Election Categories/Tags
-- CREATE TABLE votteryy_election_categories (
--   id SERIAL PRIMARY KEY,
--   category_name VARCHAR(100) UNIQUE NOT NULL,
--   description TEXT,
--   icon VARCHAR(50),
--   is_active BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- Election to Category Mapping
-- CREATE TABLE votteryy_election_category_mapping (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   category_id INTEGER NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_mapping_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   CONSTRAINT fk_mapping_category FOREIGN KEY (category_id) REFERENCES votteryyy_election_categories(id) ON DELETE CASCADE,
--   UNIQUE(election_id, category_id)
-- );

-- -- Lottery Configuration (NEW)
-- CREATE TABLE votteryy_election_lottery_config (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   is_lotterized BOOLEAN DEFAULT FALSE,
--   reward_type VARCHAR(50) CHECK (reward_type IN ('monetary', 'non_monetary', 'projected_revenue')),
--   reward_amount DECIMAL(12, 2),
--   reward_description TEXT,
--   winner_count INTEGER DEFAULT 1 CHECK (winner_count >= 1 AND winner_count <= 100),
--   prize_pool_total DECIMAL(12, 2),
--   lottery_machine_visible BOOLEAN DEFAULT TRUE,
--   auto_trigger_at_end BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_lottery_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   UNIQUE(election_id)
-- );

-- -- Lottery Winners (NEW)
-- CREATE TABLE votteryy_election_lottery_winners (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   user_id INTEGER NOT NULL,
--   prize_amount DECIMAL(12, 2),
--   prize_description TEXT,
--   draw_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   is_claimed BOOLEAN DEFAULT FALSE,
--   claimed_at TIMESTAMP,
  
--   CONSTRAINT fk_lottery_winner_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   CONSTRAINT fk_lottery_winner_user FOREIGN KEY (user_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE
-- );

-- -- Votes Table (for tracking who voted - needed for lottery)
-- CREATE TABLE votteryy_votes (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   user_id INTEGER NOT NULL,
--   question_id INTEGER NOT NULL,
--   option_id INTEGER,
--   answer_text TEXT,
--   vote_hash VARCHAR(255),
--   voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_vote_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   CONSTRAINT fk_vote_user FOREIGN KEY (user_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE,
--   CONSTRAINT fk_vote_question FOREIGN KEY (question_id) REFERENCES votteryyy_election_questions(id) ON DELETE CASCADE,
--   CONSTRAINT fk_vote_option FOREIGN KEY (option_id) REFERENCES votteryyy_election_options(id) ON DELETE CASCADE,
--   UNIQUE(election_id, user_id, question_id)
-- );

-- -- Content Creator Features Tables
-- CREATE TABLE votteryy_content_creator_icons (
--   id SERIAL PRIMARY KEY,
--   creator_id INTEGER NOT NULL,
--   election_id INTEGER NOT NULL,
--   icon_url TEXT NOT NULL,
--   icon_type VARCHAR(50) DEFAULT 'vottery_icon',
--   is_hidden BOOLEAN DEFAULT TRUE,
--   embedded_link TEXT,
--   click_count INTEGER DEFAULT 0,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_icon_creator FOREIGN KEY (creator_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE,
--   CONSTRAINT fk_icon_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
-- );

-- CREATE TABLE votteryy_one_time_voting_links (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   viewer_identifier VARCHAR(255) NOT NULL,
--   unique_link VARCHAR(255) UNIQUE NOT NULL,
--   is_used BOOLEAN DEFAULT FALSE,
--   used_at TIMESTAMP,
--   expires_at TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_otl_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
-- );

-- CREATE TABLE votteryy_projected_revenue (
--   id SERIAL PRIMARY KEY,
--   creator_id INTEGER NOT NULL,
--   election_id INTEGER NOT NULL,
--   content_platform VARCHAR(100),
--   projected_amount DECIMAL(12, 2),
--   actual_amount DECIMAL(12, 2),
--   revenue_date DATE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_revenue_creator FOREIGN KEY (creator_id) REFERENCES votteryy_user_details(id) ON DELETE CASCADE,
--   CONSTRAINT fk_revenue_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE
-- );

-- -- Security & Audit Trail Tables
-- CREATE TABLE votteryy_election_security_config (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   encryption_enabled BOOLEAN DEFAULT TRUE,
--   digital_signatures_enabled BOOLEAN DEFAULT TRUE,
--   tamper_resistance_enabled BOOLEAN DEFAULT TRUE,
--   identity_verification_required BOOLEAN DEFAULT FALSE,
--   privacy_protection_enabled BOOLEAN DEFAULT TRUE,
--   audit_trail_enabled BOOLEAN DEFAULT TRUE,
--   encryption_algorithm VARCHAR(100),
--   signature_algorithm VARCHAR(100),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_security_election FOREIGN KEY (election_id) REFERENCES votteryyy_elections(id) ON DELETE CASCADE,
--   UNIQUE(election_id)
-- );

-- CREATE TABLE votteryy_audit_trail (
--   id SERIAL PRIMARY KEY,
--   election_id INTEGER NOT NULL,
--   user_id INTEGER,
--   action_type VARCHAR(100) NOT NULL,
--   action_description TEXT,
--   ip_address VARCHAR(45),
--   user_agent TEXT,
--   data_before JSONB,
--   data_after JSONB,
--   event_hash VARCHAR(255),
--   timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   CONSTRAINT fk_audit_election FOREIGN KEY (election_id) REFERENCES votteryy_elections(id) ON DELETE CASCADE,
--   CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES votteryy_user_details(id) ON DELETE SET NULL
-- );

-- -- ============================================
-- -- INDEXES FOR PERFORMANCE
-- -- ============================================

CREATE INDEX idx_elections_creator ON votteryyy_elections(creator_id);
CREATE INDEX idx_elections_status ON votteryyy_elections(status);
CREATE INDEX idx_elections_slug ON votteryyy_elections(slug);
CREATE INDEX idx_elections_dates ON votteryyy_elections(start_date, end_date);
CREATE INDEX idx_elections_creator_type ON votteryyy_elections(creator_type);
CREATE INDEX idx_elections_org ON votteryyy_elections(organization_id) WHERE organization_id IS NOT NULL;

-- CREATE INDEX idx_questions_election ON votteryy_election_questions(election_id);
-- CREATE INDEX idx_questions_order ON votteryy_election_questions(election_id, question_order);

-- CREATE INDEX idx_options_question ON votteryy_election_options(question_id);
-- CREATE INDEX idx_options_order ON votteryy_election_options(question_id, option_order);

-- CREATE INDEX idx_regional_pricing_election ON votteryy_election_regional_pricing(election_id);

-- CREATE INDEX idx_org_members ON votteryy_organization_members(organization_id, user_id);
-- CREATE INDEX idx_org_members_user ON votteryy_organization_members(user_id);

-- CREATE INDEX idx_drafts_creator ON votteryy_election_drafts(creator_id);

-- CREATE INDEX idx_custom_urls_election ON votteryy_election_custom_urls(election_id);
-- CREATE INDEX idx_custom_urls_slug ON votteryy_election_custom_urls(custom_slug);

-- CREATE INDEX idx_lottery_election ON votteryy_election_lottery_config(election_id);
-- CREATE INDEX idx_lottery_winners_election ON votteryy_election_lottery_winners(election_id);
-- CREATE INDEX idx_lottery_winners_user ON votteryy_election_lottery_winners(user_id);

-- CREATE INDEX idx_votes_election ON votteryy_votes(election_id);
-- CREATE INDEX idx_votes_user ON votteryy_votes(user_id);
-- CREATE INDEX idx_votes_question ON votteryy_votes(question_id);

-- CREATE INDEX idx_icons_creator ON votteryy_content_creator_icons(creator_id);
-- CREATE INDEX idx_icons_election ON votteryy_content_creator_icons(election_id);

-- CREATE INDEX idx_otl_election ON votteryy_one_time_voting_links(election_id);
-- CREATE INDEX idx_otl_link ON votteryy_one_time_voting_links(unique_link);

-- CREATE INDEX idx_revenue_creator ON votteryy_projected_revenue(creator_id);
-- CREATE INDEX idx_revenue_election ON votteryy_projected_revenue(election_id);

-- CREATE INDEX idx_security_election ON votteryy_election_security_config(election_id);

-- CREATE INDEX idx_audit_election ON votteryy_audit_trail(election_id);
-- CREATE INDEX idx_audit_user ON votteryy_audit_trail(user_id);
-- CREATE INDEX idx_audit_timestamp ON votteryy_audit_trail(timestamp);

-- -- ============================================
-- -- SAMPLE DATA FOR TESTING
-- -- ============================================

-- -- Insert sample categories
-- INSERT INTO votteryy_election_categories (category_name, description, icon) VALUES
-- ('Politics', 'Political elections and polls', 'politics'),
-- ('Sports', 'Sports-related voting', 'sports'),
-- ('Entertainment', 'Movies, music, and entertainment', 'entertainment'),
-- ('Education', 'Academic and educational voting', 'education'),
-- ('Business', 'Corporate and business decisions', 'business'),
-- ('Community', 'Community decisions and polls', 'community'),
-- ('Technology', 'Tech-related polls and surveys', 'technology'),
-- ('Health', 'Health and wellness voting', 'health');

-- COMMENT ON TABLE votteryy_elections IS 'Main elections table with all configuration';
-- COMMENT ON TABLE votteryy_election_regional_pricing IS 'Regional pricing configuration for paid elections across 8 global regions';
-- COMMENT ON TABLE votteryy_election_lottery_config IS 'Lottery configuration for elections with prize pools';
-- COMMENT ON TABLE votteryy_election_lottery_winners IS 'Records of lottery winners and prize claims';