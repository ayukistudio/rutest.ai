from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "RuTest.AI Backend"
    debug: bool = False
    
    max_upload_size: int = 100 * 1024 * 1024
    
    cors_origins: list = ["*"]
    
    cache_ttl: int = 3600

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()