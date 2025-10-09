"""
API Client for xcoinalgo backend communication
"""

import requests
from typing import Dict, Any, Optional, List
from pathlib import Path
import json

from xcoin_cli.config import ConfigManager


class APIError(Exception):
    """API request error"""
    def __init__(self, message: str, status_code: Optional[int] = None, response: Optional[Dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class APIClient:
    """Client for xcoinalgo API"""

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize API client

        Args:
            api_url: API base URL (defaults to value from config)
            api_key: API key (defaults to value from config)
        """
        self.config = ConfigManager()

        # Use provided values or fallback to config
        self.api_url = api_url or self.config.get('api_url', 'http://localhost:3000')
        self.api_key = api_key or self.config.get('api_key')

        # Ensure API URL doesn't end with /
        if self.api_url.endswith('/'):
            self.api_url = self.api_url[:-1]

        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'xcoin-cli/0.1.0'
        })

        if self.api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_key}'
            })

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
        files: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request to API

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (e.g., '/api/auth/login')
            data: Request body data
            params: Query parameters
            files: Files to upload

        Returns:
            Response data as dictionary

        Raises:
            APIError: If request fails
        """
        url = f"{self.api_url}{endpoint}"

        try:
            if files:
                # Don't set Content-Type for multipart/form-data
                headers = {k: v for k, v in self.session.headers.items() if k != 'Content-Type'}
                response = self.session.request(
                    method=method,
                    url=url,
                    data=data,
                    params=params,
                    files=files,
                    headers=headers,
                    timeout=30
                )
            else:
                response = self.session.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params,
                    timeout=30
                )

            # Check for HTTP errors
            if response.status_code >= 400:
                try:
                    error_data = response.json()
                    error_message = error_data.get('error') or error_data.get('message') or 'Unknown error'
                except Exception:
                    error_message = response.text or f"HTTP {response.status_code}"

                raise APIError(
                    message=error_message,
                    status_code=response.status_code,
                    response=error_data if 'error_data' in locals() else None
                )

            # Return JSON response
            if response.status_code == 204:  # No content
                return {}

            return response.json()

        except requests.exceptions.ConnectionError:
            raise APIError("Failed to connect to xcoinalgo API. Is the server running?")
        except requests.exceptions.Timeout:
            raise APIError("Request timed out")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")

    # Authentication

    def login(self, api_key: str) -> Dict[str, Any]:
        """
        Authenticate with API key

        Args:
            api_key: User's API key

        Returns:
            User information

        Raises:
            APIError: If authentication fails
        """
        # Update session with new API key
        self.api_key = api_key
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}'
        })

        # Verify API key by fetching user info
        user_info = self._request('GET', '/api/auth/me')

        # Save to config
        self.config.set('api_key', api_key)
        self.config.set('user', user_info.get('user', {}))
        self.config.save()

        return user_info

    def logout(self):
        """Logout and clear stored credentials"""
        self.config.delete('api_key')
        self.config.delete('user')
        self.config.save()

        self.api_key = None
        if 'Authorization' in self.session.headers:
            del self.session.headers['Authorization']

    # Strategy Operations

    def create_strategy(self, strategy_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new strategy

        Args:
            strategy_data: Strategy metadata and configuration

        Returns:
            Created strategy information

        Raises:
            APIError: If creation fails
        """
        return self._request('POST', '/api/strategies', data=strategy_data)

    def update_strategy(self, strategy_id: str, strategy_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update existing strategy

        Args:
            strategy_id: Strategy ID
            strategy_data: Updated strategy data

        Returns:
            Updated strategy information

        Raises:
            APIError: If update fails
        """
        return self._request('PUT', f'/api/strategies/{strategy_id}', data=strategy_data)

    def get_strategy(self, strategy_id: str) -> Dict[str, Any]:
        """
        Get strategy details

        Args:
            strategy_id: Strategy ID

        Returns:
            Strategy information

        Raises:
            APIError: If fetch fails
        """
        return self._request('GET', f'/api/strategies/{strategy_id}')

    def list_strategies(self) -> List[Dict[str, Any]]:
        """
        List all user strategies

        Returns:
            List of strategies

        Raises:
            APIError: If fetch fails
        """
        response = self._request('GET', '/api/strategies')
        return response.get('strategies', [])

    def upload_strategy_code(
        self,
        strategy_id: str,
        strategy_file: Path,
        config_file: Path,
        requirements_file: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Upload strategy code files

        Args:
            strategy_id: Strategy ID
            strategy_file: Path to strategy.py
            config_file: Path to config.json
            requirements_file: Path to requirements.txt (optional)

        Returns:
            Upload response

        Raises:
            APIError: If upload fails
        """
        files = {
            'strategy': ('strategy.py', open(strategy_file, 'rb'), 'text/x-python'),
            'config': ('config.json', open(config_file, 'rb'), 'application/json')
        }

        if requirements_file and requirements_file.exists():
            files['requirements'] = ('requirements.txt', open(requirements_file, 'rb'), 'text/plain')

        try:
            return self._request(
                'POST',
                f'/api/strategies/{strategy_id}/upload',
                files=files
            )
        finally:
            # Close file handles
            for file_tuple in files.values():
                file_tuple[1].close()

    # Git Integration

    def link_git_repository(
        self,
        strategy_id: str,
        repo_url: str,
        branch: str = 'main',
        auto_deploy: bool = False
    ) -> Dict[str, Any]:
        """
        Link Git repository to strategy

        Args:
            strategy_id: Strategy ID
            repo_url: Git repository URL
            branch: Branch name (default: main)
            auto_deploy: Auto-deploy on push (default: False)

        Returns:
            Git integration information including webhook URL

        Raises:
            APIError: If linking fails
        """
        return self._request(
            'POST',
            f'/api/strategies/{strategy_id}/git',
            data={
                'repositoryUrl': repo_url,
                'branch': branch,
                'autoDeploy': auto_deploy
            }
        )

    def sync_git_repository(self, strategy_id: str) -> Dict[str, Any]:
        """
        Manually trigger Git sync

        Args:
            strategy_id: Strategy ID

        Returns:
            Sync result

        Raises:
            APIError: If sync fails
        """
        return self._request('POST', f'/api/strategies/{strategy_id}/git/sync')

    def unlink_git_repository(self, strategy_id: str) -> Dict[str, Any]:
        """
        Unlink Git repository from strategy

        Args:
            strategy_id: Strategy ID

        Returns:
            Success response

        Raises:
            APIError: If unlinking fails
        """
        return self._request('DELETE', f'/api/strategies/{strategy_id}/git')

    # Deployment

    def deploy_strategy(self, strategy_id: str) -> Dict[str, Any]:
        """
        Deploy strategy to marketplace

        Args:
            strategy_id: Strategy ID

        Returns:
            Deployment information

        Raises:
            APIError: If deployment fails
        """
        return self._request('POST', f'/api/strategies/{strategy_id}/deploy')

    def get_strategy_status(self, strategy_id: str) -> Dict[str, Any]:
        """
        Get strategy deployment status

        Args:
            strategy_id: Strategy ID

        Returns:
            Status information including:
                - validationStatus
                - deploymentStatus
                - gitInfo
                - subscriberCount
                - performance metrics

        Raises:
            APIError: If fetch fails
        """
        return self._request('GET', f'/api/strategies/{strategy_id}/status')

    # Logs

    def get_execution_logs(
        self,
        strategy_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get strategy execution logs

        Args:
            strategy_id: Strategy ID
            limit: Number of logs to fetch
            offset: Offset for pagination

        Returns:
            Logs data

        Raises:
            APIError: If fetch fails
        """
        return self._request(
            'GET',
            f'/api/strategies/{strategy_id}/logs',
            params={'limit': limit, 'offset': offset}
        )

    # Validation

    def validate_strategy_remote(
        self,
        strategy_file: Path,
        config_file: Path
    ) -> Dict[str, Any]:
        """
        Validate strategy on server (alternative to local validation)

        Args:
            strategy_file: Path to strategy.py
            config_file: Path to config.json

        Returns:
            Validation result

        Raises:
            APIError: If validation fails
        """
        files = {
            'strategy': ('strategy.py', open(strategy_file, 'rb'), 'text/x-python'),
            'config': ('config.json', open(config_file, 'rb'), 'application/json')
        }

        try:
            return self._request('POST', '/api/strategies/validate', files=files)
        finally:
            for file_tuple in files.values():
                file_tuple[1].close()

    # Helper methods

    def is_authenticated(self) -> bool:
        """Check if client is authenticated"""
        return self.api_key is not None

    def get_user_info(self) -> Optional[Dict[str, Any]]:
        """Get stored user information"""
        return self.config.get('user')
